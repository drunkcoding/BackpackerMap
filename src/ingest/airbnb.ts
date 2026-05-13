import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from 'better-sqlite3';
import { getOrCreateSource, upsertProperty, type PropertyInput } from '../db/repo.ts';
import { enrichAirbnb, type AirbnbEnrichment } from '../lib/pyairbnb.ts';

export interface AirbnbListingRef {
  id: string;
  url: string;
}

export function parseExport(json: unknown): AirbnbListingRef[] {
  const refs: AirbnbListingRef[] = [];
  const seen = new Set<string>();

  const consider = (rawId: unknown, rawUrl: unknown): void => {
    const id = normaliseId(rawId, rawUrl);
    const url = normaliseUrl(rawUrl, id);
    if (!id || !url || seen.has(id)) return;
    seen.add(id);
    refs.push({ id, url });
  };

  if (!isRecord(json)) return refs;

  const wishlists = json['Wishlists'] ?? json['wishlists'];
  if (Array.isArray(wishlists)) {
    for (const wl of wishlists) {
      if (!isRecord(wl)) continue;
      const listings = wl['listings'] ?? wl['Listings'];
      if (!Array.isArray(listings)) continue;
      for (const item of listings) {
        if (!isRecord(item)) continue;
        const id = item['listing_id'] ?? item['id'] ?? item['listingId'];
        const url = item['listing_url'] ?? item['url'];
        consider(id, url);
      }
    }
  }

  return refs;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normaliseId(rawId: unknown, rawUrl: unknown): string | null {
  if (typeof rawId === 'string' && rawId.trim()) return rawId.trim();
  if (typeof rawId === 'number' && Number.isFinite(rawId)) return String(rawId);
  if (typeof rawUrl === 'string') {
    const m = rawUrl.match(/\/rooms\/(\d+)/);
    if (m) return m[1]!;
  }
  return null;
}

function normaliseUrl(rawUrl: unknown, id: string | null): string | null {
  if (typeof rawUrl === 'string' && rawUrl.startsWith('http')) return rawUrl;
  if (id) return `https://www.airbnb.com/rooms/${id}`;
  return null;
}

export interface IngestAirbnbOptions {
  pythonBin?: string;
  scriptPath?: string;
  timeoutMs?: number;
  retries?: number;
  concurrency?: number;
  env?: NodeJS.ProcessEnv;
}

export interface IngestAirbnbResult {
  total: number;
  enriched: number;
  failed: Array<{ url: string; message: string }>;
}

function defaultScriptPath(): string {
  const here = fileURLToPath(new URL('.', import.meta.url));
  return resolve(here, '..', '..', 'scripts', 'pyairbnb_enrich.py');
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const runners: Promise<void>[] = [];
  for (let i = 0; i < Math.min(limit, queue.length); i++) {
    runners.push(
      (async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (next === undefined) return;
          await worker(next);
        }
      })(),
    );
  }
  await Promise.all(runners);
}

export interface DryRunResult {
  total: number;
  refs: AirbnbListingRef[];
}

export function dryRunAirbnb(exportPath: string): DryRunResult {
  const raw = JSON.parse(readFileSync(exportPath, 'utf8')) as unknown;
  const refs = parseExport(raw);
  return { total: refs.length, refs };
}

export async function ingestAirbnb(
  exportPath: string,
  db: Database,
  options: IngestAirbnbOptions = {},
): Promise<IngestAirbnbResult> {
  const raw = JSON.parse(readFileSync(exportPath, 'utf8')) as unknown;
  const refs = parseExport(raw);
  if (refs.length === 0) {
    return { total: 0, enriched: 0, failed: [] };
  }

  const scriptPath = options.scriptPath ?? defaultScriptPath();
  const sourceId = getOrCreateSource(db, 'airbnb');
  const failed: IngestAirbnbResult['failed'] = [];
  let enriched = 0;

  await runWithConcurrency(refs, Math.max(1, options.concurrency ?? 2), async (ref) => {
    try {
      const data = await enrichAirbnb(ref.url, {
        scriptPath,
        ...(options.pythonBin ? { pythonBin: options.pythonBin } : {}),
        ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
        ...(options.retries !== undefined ? { retries: options.retries } : {}),
        ...(options.env ? { env: options.env } : {}),
      });
      const input = toPropertyInput(sourceId, ref, data);
      upsertProperty(db, input);
      enriched++;
    } catch (err) {
      failed.push({
        url: ref.url,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return { total: refs.length, enriched, failed };
}

function toPropertyInput(
  sourceId: number,
  ref: AirbnbListingRef,
  data: AirbnbEnrichment,
): PropertyInput {
  return {
    sourceId,
    provider: 'airbnb',
    externalId: ref.id,
    name: data.name ?? `Airbnb listing ${ref.id}`,
    url: ref.url,
    lat: data.lat,
    lng: data.lng,
    priceLabel: data.price_label,
    photoUrl: data.photo,
    rawJson: JSON.stringify(data),
    enrichedAt: new Date().toISOString(),
  };
}

export { defaultScriptPath };
