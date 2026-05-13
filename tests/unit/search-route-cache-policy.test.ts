import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Database } from 'better-sqlite3';
import { openDb, getCachedSearch } from '../../src/db/repo.ts';
import { createApp } from '../../src/server/app.ts';
import { cacheKey, canonicaliseQuery } from '../../src/search/canonical.ts';
import type { SearchDispatcher } from '../../src/search/dispatcher.ts';
import type { ProviderResult, SearchQuery } from '../../src/search/types.ts';

const VALID_BBOX_PARAMS = '?north=57.2&south=57.0&east=-3.7&west=-3.9';
const VALID_BBOX_QUERY: SearchQuery = {
  bbox: { north: 57.2, south: 57.0, east: -3.7, west: -3.9 },
  zoom: 12,
  checkin: null,
  checkout: null,
  guests: { adults: 2, children: 0, infants: 0, pets: 0 },
  currency: 'EUR',
  maxResults: 50,
  mode: 'list',
};

function fakeResult(provider: 'airbnb' | 'booking', id: string): ProviderResult {
  return {
    provider,
    externalId: id,
    name: `${provider}-${id}`,
    url: `https://example.com/${id}`,
    lat: 57.1,
    lng: -3.8,
    priceLabel: '£100/night',
    priceAmount: 100,
    currency: 'GBP',
    photoUrl: null,
    rating: null,
    reviewCount: null,
    rawJson: '{}',
  };
}

function makeApp(
  db: Database,
  dispatchResults: ProviderResult[],
  warnings: Array<{ provider: string; message: string }> = [],
) {
  const dispatcher: SearchDispatcher = {
    search: vi.fn(async () => ({
      results: dispatchResults,
      warnings,
      providersRan: ['fake'],
    })),
  };
  return createApp({
    db,
    ors: { getDrivingDistance: async () => ({ meters: 0, seconds: 0 }) },
    searchDispatcher: dispatcher,
    searchCacheTtlMs: 60_000,
  });
}

describe('search route cache policy', () => {
  let db: Database;
  beforeEach(() => {
    db = openDb(':memory:');
  });
  afterEach(() => db.close());

  it('writes a cache row when dispatch has no warnings', async () => {
    const app = makeApp(db, [fakeResult('airbnb', '1')], []);
    await request(app).get(`/api/search${VALID_BBOX_PARAMS}`);
    const key = cacheKey(canonicaliseQuery(VALID_BBOX_QUERY), 'all');
    const row = getCachedSearch(db, key, 60_000);
    expect(row).not.toBeNull();
    expect(row!.candidateIds.length).toBeGreaterThan(0);
  });

  it('does NOT write a cache row when ANY provider warned', async () => {
    const app = makeApp(
      db,
      [fakeResult('airbnb', '1')],
      [{ provider: 'booking-diy', message: 'datadome blocked' }],
    );
    const res = await request(app).get(`/api/search${VALID_BBOX_PARAMS}`);
    expect(res.status).toBe(200);
    expect(res.body.warnings).toHaveLength(1);
    const key = cacheKey(canonicaliseQuery(VALID_BBOX_QUERY), 'all');
    const row = getCachedSearch(db, key, 60_000);
    expect(row).toBeNull();
  });

  it('does NOT write a cache row when dispatch returns empty AND warned', async () => {
    const app = makeApp(
      db,
      [],
      [{ provider: 'booking-diy', message: 'all hotels failed parse' }],
    );
    await request(app).get(`/api/search${VALID_BBOX_PARAMS}`);
    const key = cacheKey(canonicaliseQuery(VALID_BBOX_QUERY), 'all');
    const row = getCachedSearch(db, key, 60_000);
    expect(row).toBeNull();
  });

  it('writes a cache row for legitimately empty results (no warnings)', async () => {
    const app = makeApp(db, [], []);
    await request(app).get(`/api/search${VALID_BBOX_PARAMS}`);
    const key = cacheKey(canonicaliseQuery(VALID_BBOX_QUERY), 'all');
    const row = getCachedSearch(db, key, 60_000);
    expect(row).not.toBeNull();
    expect(row!.candidateIds).toEqual([]);
  });
});
