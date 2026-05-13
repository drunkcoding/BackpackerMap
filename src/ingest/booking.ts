import { readFileSync } from 'node:fs';
import * as cheerio from 'cheerio';
import type { Browser, BrowserContext, Page, Cookie } from 'playwright';
import { chromium } from 'playwright';
import type { Database } from 'better-sqlite3';
import { getOrCreateSource, upsertProperty, type PropertyInput } from '../db/repo.ts';
import { applyStealth } from './stealth.ts';
import { createNominatimGeocoder, type Geocoder } from './geocode.ts';

export interface BookingWishlistItem {
  name: string;
  url: string;
  hotelId: string;
}

export interface BookingPropertyData {
  lat: number | null;
  lng: number | null;
  name: string | null;
  photo: string | null;
  priceLabel: string | null;
  address: string | null;
}

export function loadCookies(path: string): Cookie[] {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error('cookies file must be a JSON array');
  }
  return raw.map(normaliseCookie);
}

function normaliseCookie(c: unknown): Cookie {
  if (typeof c !== 'object' || c === null) throw new Error('invalid cookie entry');
  const r = c as Record<string, unknown>;
  const sameSiteRaw = String(r['sameSite'] ?? r['same_site'] ?? 'Lax').toLowerCase();
  const sameSite: Cookie['sameSite'] =
    sameSiteRaw === 'strict' ? 'Strict' : sameSiteRaw === 'none' ? 'None' : 'Lax';
  const expires = typeof r['expirationDate'] === 'number'
    ? (r['expirationDate'] as number)
    : typeof r['expires'] === 'number'
      ? (r['expires'] as number)
      : -1;
  return {
    name: String(r['name']),
    value: String(r['value']),
    domain: String(r['domain'] ?? '.booking.com'),
    path: String(r['path'] ?? '/'),
    expires,
    httpOnly: Boolean(r['httpOnly'] ?? r['http_only'] ?? false),
    secure: Boolean(r['secure'] ?? true),
    sameSite,
  };
}

const HOTEL_HREF_RE = /\/hotel\/[a-z]{2}\/([a-z0-9-]+)\.(?:[a-z]{2}-[a-z]{2}\.)?html/i;

export function parseWishlistHtml(html: string): BookingWishlistItem[] {
  const $ = cheerio.load(html);
  const items: BookingWishlistItem[] = [];
  const seen = new Set<string>();

  $('a[href*="/hotel/"]').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const m = href.match(HOTEL_HREF_RE);
    if (!m) return;
    const hotelId = m[1]!;
    if (seen.has(hotelId)) return;

    const titleNode = $(el)
      .find('[data-testid="title"], h3, h4, .sr-hotel__name, [data-testid="header-title"]')
      .first();
    const name =
      (titleNode.text() || $(el).attr('aria-label') || $(el).attr('title') || '').trim() ||
      hotelId;

    const url = href.startsWith('http') ? href : `https://www.booking.com${href}`;

    seen.add(hotelId);
    items.push({ hotelId, name, url });
  });

  return items;
}

export function extractAtlasLatLng(html: string): { lat: number; lng: number } | null {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  let result: { lat: number; lng: number } | null = null;
  $('[data-atlas-latlng]').each((_i, el) => {
    const raw = $(el).attr('data-atlas-latlng');
    if (!raw || seen.has(raw)) return;
    seen.add(raw);
    const parts = raw.split(',');
    if (parts.length !== 2) return;
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (lat === 0 && lng === 0) return;
    if (!result) result = { lat, lng };
  });
  return result;
}

export function extractJsonLd(html: string): BookingPropertyData {
  const $ = cheerio.load(html);
  let lat: number | null = null;
  let lng: number | null = null;
  let name: string | null = null;
  let photo: string | null = null;
  let priceLabel: string | null = null;
  let address: string | null = null;

  $('script[type="application/ld+json"]').each((_i, el) => {
    const txt = $(el).contents().text();
    if (!txt) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(txt);
    } catch {
      return;
    }
    const nodes = Array.isArray(parsed) ? parsed : [parsed];
    for (const node of nodes) {
      if (!isRecord(node)) continue;
      const t = node['@type'];
      const type = Array.isArray(t) ? t.map(String) : [String(t ?? '')];
      const isHotelLike = type.some((x) =>
        ['Hotel', 'LodgingBusiness', 'Accommodation', 'BedAndBreakfast', 'Hostel', 'Resort'].includes(
          x,
        ),
      );
      if (!isHotelLike) continue;
      if (lat === null || lng === null) {
        const geo = node['geo'];
        if (isRecord(geo)) {
          const la = Number(geo['latitude']);
          const lo = Number(geo['longitude']);
          if (Number.isFinite(la) && Number.isFinite(lo)) {
            lat = la;
            lng = lo;
          }
        }
      }
      if (!name && typeof node['name'] === 'string') name = node['name'];
      if (!photo) {
        const img = node['image'];
        if (typeof img === 'string') photo = img;
        else if (Array.isArray(img) && typeof img[0] === 'string') photo = img[0];
      }
      if (!priceLabel) {
        const price = node['priceRange'];
        if (typeof price === 'string' && price.trim()) priceLabel = price.trim();
      }
      if (!address) {
        const addr = node['address'];
        if (typeof addr === 'string' && addr.trim()) {
          address = addr.trim();
        } else if (isRecord(addr)) {
          const parts = [
            addr['streetAddress'],
            addr['addressLocality'],
            addr['addressRegion'],
            addr['postalCode'],
            addr['addressCountry'],
          ]
            .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
            .map((p) => p.trim());
          if (parts.length > 0) address = parts.join(', ');
        }
      }
    }
  });

  if (priceLabel === null) {
    const live = $('[data-testid="price-and-discounted-price"], .prco-valign-middle-helper').first().text().trim();
    if (live) priceLabel = live.replace(/\s+/g, ' ').slice(0, 60);
  }

  return { lat, lng, name, photo, priceLabel, address };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export interface ScrapeWishlistDeps {
  fetchHtml: (url: string) => Promise<string>;
}

export async function scrapeWishlist(
  deps: ScrapeWishlistDeps,
  wishlistUrl = 'https://www.booking.com/mywishlist.html',
): Promise<BookingWishlistItem[]> {
  const html = await deps.fetchHtml(wishlistUrl);
  return parseWishlistHtml(html);
}

export interface IngestBookingOptions {
  cookiesPath?: string;
  wishlistUrl?: string;
  perRequestDelayMs?: number;
  headless?: boolean;
  fetchHtml?: (url: string) => Promise<string>;
  proxy?: { server: string; username?: string; password?: string };
  geocoder?: Geocoder | null;
  stealth?: boolean;
}

export interface IngestBookingResult {
  total: number;
  enriched: number;
  failed: Array<{ url: string; message: string }>;
}

function resolveProxy(opts: IngestBookingOptions['proxy']): IngestBookingOptions['proxy'] | undefined {
  if (opts) return opts;
  const url = process.env['HTTPS_PROXY'] ?? process.env['HTTP_PROXY'];
  if (!url) return undefined;
  return { server: url };
}

function resolveGeocoder(opts: IngestBookingOptions): Geocoder | null {
  if (opts.geocoder !== undefined) return opts.geocoder;
  return createNominatimGeocoder();
}

export async function ingestBooking(
  db: Database,
  options: IngestBookingOptions = {},
): Promise<IngestBookingResult> {
  const wishlistUrl = options.wishlistUrl ?? 'https://www.booking.com/mywishlist.html';
  const perRequestDelayMs = options.perRequestDelayMs ?? 5_000;
  const geocoder = resolveGeocoder(options);

  if (options.fetchHtml) {
    return ingestWithFetcher(db, options.fetchHtml, wishlistUrl, 0, geocoder);
  }

  if (!options.cookiesPath) {
    throw new Error('cookiesPath is required when fetchHtml is not provided');
  }
  const cookies = loadCookies(options.cookiesPath);
  const proxy = resolveProxy(options.proxy);

  const browser: Browser = await chromium.launch({
    headless: options.headless ?? true,
    ...(proxy ? { proxy } : {}),
  });
  try {
    const context: BrowserContext = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 900 },
      locale: 'en-GB',
      timezoneId: 'Europe/London',
    });
    if (options.stealth !== false) {
      await applyStealth(context);
    }
    await context.addCookies(cookies);
    const page: Page = await context.newPage();

    const fetcher = async (url: string): Promise<string> => {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      return page.content();
    };

    return await ingestWithFetcher(db, fetcher, wishlistUrl, perRequestDelayMs, geocoder);
  } finally {
    await browser.close();
  }
}

async function ingestWithFetcher(
  db: Database,
  fetchHtml: (url: string) => Promise<string>,
  wishlistUrl: string,
  perRequestDelayMs = 0,
  geocoder: Geocoder | null = null,
): Promise<IngestBookingResult> {
  const items = await scrapeWishlist({ fetchHtml }, wishlistUrl);
  if (items.length === 0) {
    return { total: 0, enriched: 0, failed: [] };
  }

  const sourceId = getOrCreateSource(db, 'booking');
  const failed: IngestBookingResult['failed'] = [];
  let enriched = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    try {
      const html = await fetchHtml(item.url);
      const data = extractJsonLd(html);
      if ((data.lat === null || data.lng === null) && data.address && geocoder) {
        const fallback = await geocoder.geocode(data.address);
        if (fallback) {
          data.lat = fallback.lat;
          data.lng = fallback.lng;
        }
      }
      const input = toPropertyInput(sourceId, item, data);
      upsertProperty(db, input);
      enriched++;
    } catch (err) {
      failed.push({
        url: item.url,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    if (perRequestDelayMs > 0 && i < items.length - 1) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, perRequestDelayMs));
    }
  }

  return { total: items.length, enriched, failed };
}

function toPropertyInput(
  sourceId: number,
  item: BookingWishlistItem,
  data: BookingPropertyData,
): PropertyInput {
  return {
    sourceId,
    provider: 'booking',
    externalId: item.hotelId,
    name: data.name ?? item.name,
    url: item.url,
    lat: data.lat,
    lng: data.lng,
    priceLabel: data.priceLabel,
    photoUrl: data.photo,
    rawJson: JSON.stringify(data),
    enrichedAt: new Date().toISOString(),
  };
}
