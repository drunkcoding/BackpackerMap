import * as cheerio from 'cheerio';
import {
  ProviderError,
  type ProviderResult,
  type SearchProvider,
  type SearchQuery,
} from '../types.ts';
import { extractJsonLd, parseWishlistHtml } from '../../ingest/booking.ts';
import { createNominatimGeocoder, type Geocoder } from '../../ingest/geocode.ts';
import { buildBookingSearchUrl } from './booking-url.ts';

export interface BookingDIYProviderOptions {
  fetchHtml: (url: string) => Promise<string>;
  perRequestDelayMs?: number;
  geocoder?: Geocoder | null;
  maxDetailFetches?: number;
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

    const maxDetails = this.options.maxDetailFetches ?? query.maxResults;
    const slice = cards.slice(0, maxDetails);
    const geocoder = this.options.geocoder ?? createNominatimGeocoder();
    const delay = this.options.perRequestDelayMs ?? 0;
    const results: ProviderResult[] = [];

    for (let i = 0; i < slice.length; i++) {
      const card = slice[i]!;
      try {
        const html = await this.options.fetchHtml(card.url);
        const jsonld = extractJsonLd(html);
        let lat = jsonld.lat;
        let lng = jsonld.lng;
        if ((lat === null || lng === null) && jsonld.address && geocoder) {
          const fallback = await geocoder.geocode(jsonld.address);
          if (fallback) {
            lat = fallback.lat;
            lng = fallback.lng;
          }
        }
        if (lat === null || lng === null) continue;

        const photo = jsonld.photo ?? card.thumbnail;
        const priceLabel = jsonld.priceLabel ?? card.pricePerNight;
        results.push({
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
        });
      } catch (err) {
        void err;
      }
      if (delay > 0 && i < slice.length - 1) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    return results;
  }
}
