import { createHash } from 'node:crypto';
import type { ProviderName, SearchQuery } from './types.ts';

const BBOX_PRECISION = 1000;

function round3(n: number): number {
  return Math.round(n * BBOX_PRECISION) / BBOX_PRECISION;
}

function sortedJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    const items = [...value].map(sortedJson);
    return `[${items.join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${sortedJson(obj[k])}`);
  return `{${entries.join(',')}}`;
}

export function canonicaliseQuery(q: SearchQuery): SearchQuery {
  return {
    ...q,
    bbox: {
      north: round3(q.bbox.north),
      south: round3(q.bbox.south),
      east: round3(q.bbox.east),
      west: round3(q.bbox.west),
    },
    roomTypes: q.roomTypes ? [...q.roomTypes].sort() : undefined,
    amenities: q.amenities ? [...q.amenities].sort() : undefined,
    mealPlans: q.mealPlans ? [...q.mealPlans].sort() : undefined,
    neighbourhoods: q.neighbourhoods ? [...q.neighbourhoods].sort() : undefined,
    hostTypes: q.hostTypes ? [...q.hostTypes].sort() : undefined,
  } as SearchQuery;
}

export function cacheKey(q: SearchQuery, providerScope: ProviderName | 'all'): string {
  const canon = canonicaliseQuery(q);
  const serial = sortedJson(canon);
  return createHash('sha1').update(`${providerScope}|${serial}`).digest('hex');
}
