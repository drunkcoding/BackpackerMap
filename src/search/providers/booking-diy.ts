import * as cheerio from 'cheerio';
import {
  ProviderError,
  type ProviderResult,
  type SearchProvider,
  type SearchQuery,
} from '../types.ts';
import { extractAtlasLatLng, extractJsonLd, parseWishlistHtml } from '../../ingest/booking.ts';
import { createNominatimGeocoder, type Geocoder } from '../../ingest/geocode.ts';
import { buildBookingSearchUrl } from './booking-url.ts';

export interface BookingDIYProviderOptions {
  fetchHtml: (url: string) => Promise<string>;
  perRequestDelayMs?: number;
  geocoder?: Geocoder | null;
  maxDetailFetches?: number;
  /**
   * Concurrency, max detail fetches, and delay used when SearchQuery.mode === 'list'.
   * Defaults are tuned for ~10s wall-clock with reasonable bot-protection headroom.
   * The 'detail' mode (legacy behaviour) keeps the slow serial fetch with the
   * larger maxDetailFetches and perRequestDelayMs above.
   */
  listMode?: {
    concurrency?: number;
    maxDetailFetches?: number;
    perRequestDelayMs?: number;
  };
}

interface ParsedSearchCard {
  hotelId: string;
  name: string;
  url: string;
  thumbnail: string | null;
  pricePerNight: string | null;
  reviewScore: number | null;
  reviewCount: number | null;
}

export function parseBookingSearchHtml(html: string): ParsedSearchCard[] {
  const items = parseWishlistHtml(html);
  const $ = cheerio.load(html);
  const byHotelId = new Map<string, ParsedSearchCard>();

  for (const item of items) {
    byHotelId.set(item.hotelId, {
      hotelId: item.hotelId,
      name: item.name,
      url: item.url,
      thumbnail: null,
      pricePerNight: null,
      reviewScore: null,
      reviewCount: null,
    });
  }

  $('[data-testid="property-card"]').each((_i, el) => {
    const $el = $(el);
    const href = $el.find('a[href*="/hotel/"]').first().attr('href');
    if (!href) return;
    const match = href.match(/\/hotel\/[a-z]{2}\/([a-z0-9-]+)/i);
    if (!match) return;
    const hotelId = match[1]!;
    const existing = byHotelId.get(hotelId);
    if (!existing) return;

    const thumb = $el.find('[data-testid="image"]').first().attr('src');
    if (thumb) existing.thumbnail = thumb;

    const priceText = $el.find('[data-testid="price-and-discounted-price"]').first().text().trim();
    if (priceText) existing.pricePerNight = priceText.replace(/\s+/g, ' ');

    const scoreText = $el
      .find('[data-testid="review-score"] [aria-hidden="true"]')
      .first()
      .text()
      .trim();
    const scoreNum = Number(scoreText);
    if (Number.isFinite(scoreNum) && scoreText) existing.reviewScore = scoreNum;

    const reviewCountText = $el.find('[data-testid="review-score"]').text();
    const countMatch = reviewCountText.match(/([\d,]+)\s*reviews?/i);
    if (countMatch) {
      existing.reviewCount = Number(countMatch[1]!.replace(/,/g, ''));
    }
  });

  return [...byHotelId.values()];
}

export class BookingDIYProvider implements SearchProvider {
  readonly name = 'booking-diy';
  readonly provider = 'booking' as const;

  constructor(private readonly options: BookingDIYProviderOptions) {}

  async search(query: SearchQuery): Promise<ProviderResult[]> {
    const searchUrl = buildBookingSearchUrl(query);
    let searchHtml: string;
    try {
      searchHtml = await this.options.fetchHtml(searchUrl);
    } catch (err) {
      throw new ProviderError(
        `Booking search page fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        this.name,
        err,
      );
    }

    const cards = parseBookingSearchHtml(searchHtml);
    if (cards.length === 0) return [];

    const isList = (query.mode ?? 'list') === 'list';
    const lm = this.options.listMode;
    const maxDetails =
      (isList ? lm?.maxDetailFetches : undefined) ??
      this.options.maxDetailFetches ??
      query.maxResults;
    const delay =
      (isList ? lm?.perRequestDelayMs : undefined) ?? this.options.perRequestDelayMs ?? 0;
    const concurrency = Math.max(1, (isList ? lm?.concurrency : undefined) ?? 1);
    const slice = cards.slice(0, maxDetails);
    const geocoder = this.options.geocoder ?? createNominatimGeocoder();

    const fetchOne = async (card: ParsedSearchCard): Promise<ProviderResult | null> => {
      try {
        const html = await this.options.fetchHtml(card.url);
        const atlas = extractAtlasLatLng(html);
        const jsonld = extractJsonLd(html);
        let lat = atlas?.lat ?? jsonld.lat;
        let lng = atlas?.lng ?? jsonld.lng;
        if ((lat === null || lng === null) && jsonld.address && geocoder) {
          const fallback = await geocoder.geocode(jsonld.address);
          if (fallback) {
            lat = fallback.lat;
            lng = fallback.lng;
          }
        }
        if (lat === null || lng === null) return null;

        const photo = jsonld.photo ?? card.thumbnail;
        const priceLabel = jsonld.priceLabel ?? card.pricePerNight;
        return {
          provider: 'booking',
          externalId: card.hotelId,
          name: jsonld.name ?? card.name,
          url: card.url,
          lat,
          lng,
          priceLabel,
          priceAmount: null,
          currency: null,
          photoUrl: photo,
          rating: card.reviewScore,
          reviewCount: card.reviewCount,
          rawJson: JSON.stringify({ card, jsonld }),
        };
      } catch (err) {
        console.warn(
          `[booking-diy] detail fetch failed for ${card.url}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      }
    };

    if (concurrency === 1) {
      const results: ProviderResult[] = [];
      for (let i = 0; i < slice.length; i++) {
        const r = await fetchOne(slice[i]!);
        if (r) results.push(r);
        if (delay > 0 && i < slice.length - 1) {
          await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
        }
      }
      return results;
    }

    // Worker-pool concurrency: N workers pull from a shared queue. Each worker
    // inserts the per-request delay between its own fetches (not between every
    // global request) so the effective throughput is roughly N / delay.
    const queue = [...slice];
    const results: ProviderResult[] = [];
    const worker = async () => {
      while (queue.length > 0) {
        const card = queue.shift();
        if (!card) return;
        const r = await fetchOne(card);
        if (r) results.push(r);
        if (delay > 0 && queue.length > 0) {
          await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return results;
  }
}
