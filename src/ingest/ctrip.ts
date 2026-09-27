import { readFileSync } from 'node:fs';
import * as cheerio from 'cheerio';
import type { Database } from 'better-sqlite3';
import { getOrCreateSource, upsertProperty, type PropertyInput } from '../db/repo.ts';
import type { Geocoder } from './geocode.ts';

export interface CtripHotelEntry {
  url: string;
  name?: string;
  address?: string;
}

export interface CtripDetail {
  name: string | null;
  address: string | null;
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function hotelIdFromUrl(url: string): string | null {
  const query = url.match(/[?&]hotelId=(\d+)/i);
  if (query?.[1]) return query[1];
  const path = url.match(/\/hotels?\/(\d+)\.html/i);
  return path?.[1] ?? null;
}

export function parseCtripDetail(html: string): CtripDetail {
  const $ = cheerio.load(html);
  const rawTitle = $('title').first().text().trim();
  let name: string | null = null;
  if (rawTitle) {
    const beforePrice = rawTitle.split(/预订价格|預訂價格/)[0]!.trim();
    name = beforePrice.replace(/【[^】]*】\s*$/, '').trim() || null;
  }
  const address = $('[class*="addressDesc"]').first().text().trim() || null;
  return { name, address };
}

async function defaultFetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': DEFAULT_UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function loadEntries(listPath: string): CtripHotelEntry[] {
  const raw = JSON.parse(readFileSync(listPath, 'utf8')) as unknown;
  const arr = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw['hotels'])
      ? raw['hotels']
      : null;
  if (!arr) {
    throw new Error('ctrip hotels file must be a JSON array or { "hotels": [...] }');
  }
  return arr.map((e): CtripHotelEntry => {
    if (!isRecord(e) || typeof e['url'] !== 'string') {
      throw new Error('each ctrip entry needs a "url" string');
    }
    return {
      url: e['url'],
      ...(typeof e['name'] === 'string' ? { name: e['name'] } : {}),
      ...(typeof e['address'] === 'string' ? { address: e['address'] } : {}),
    };
  });
}

export interface IngestCtripOptions {
  geocoder: Geocoder;
  listPath?: string;
  entries?: CtripHotelEntry[];
  fetchHtml?: (url: string) => Promise<string>;
}

export interface IngestCtripResult {
  total: number;
  enriched: number;
  failed: Array<{ url: string; message: string }>;
}

export async function ingestCtrip(
  db: Database,
  options: IngestCtripOptions,
): Promise<IngestCtripResult> {
  const entries = options.entries ?? loadEntries(options.listPath ?? './data/ctrip/hotels.json');
  const fetchHtml = options.fetchHtml ?? defaultFetchHtml;
  const { geocoder } = options;
  if (entries.length === 0) return { total: 0, enriched: 0, failed: [] };

  const sourceId = getOrCreateSource(db, 'ctrip');
  const failed: IngestCtripResult['failed'] = [];
  let enriched = 0;

  for (const entry of entries) {
    try {
      const hotelId = hotelIdFromUrl(entry.url);
      if (!hotelId) throw new Error('could not parse a hotelId from the URL');

      let detail: CtripDetail = { name: null, address: null };
      let fetchError: string | null = null;
      try {
        detail = parseCtripDetail(await fetchHtml(entry.url));
      } catch (err) {
        fetchError = err instanceof Error ? err.message : String(err);
      }

      const name = detail.name ?? entry.name ?? null;
      const address = detail.address ?? entry.address ?? null;
      if (!address) {
        throw new Error(
          fetchError
            ? `fetch failed (${fetchError}) and no fallback address provided`
            : 'no address found on page and none provided',
        );
      }

      const geo = await geocoder.geocode(address);
      if (!geo) throw new Error(`geocode returned no result for: ${address}`);

      const input: PropertyInput = {
        sourceId,
        provider: 'ctrip',
        externalId: hotelId,
        name: name ?? `Ctrip hotel ${hotelId}`,
        url: entry.url,
        lat: geo.lat,
        lng: geo.lng,
        priceLabel: null,
        photoUrl: null,
        rawJson: JSON.stringify({ ...detail, resolvedAddress: address }),
        enrichedAt: new Date().toISOString(),
      };
      upsertProperty(db, input);
      enriched++;
    } catch (err) {
      failed.push({ url: entry.url, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { total: entries.length, enriched, failed };
}
