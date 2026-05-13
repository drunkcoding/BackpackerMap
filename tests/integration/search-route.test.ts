import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Database } from 'better-sqlite3';
import { openDb } from '../../src/db/repo.ts';
import { createApp } from '../../src/server/app.ts';
import type { SearchDispatcher } from '../../src/search/dispatcher.ts';
import type { ProviderResult } from '../../src/search/types.ts';

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
    rating: 4.5,
    reviewCount: 50,
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
  const app = createApp({
    db,
    ors: { getDrivingDistance: async () => ({ meters: 0, seconds: 0 }) },
    searchDispatcher: dispatcher,
    searchCacheTtlMs: 60_000,
  });
  return { app, dispatcher };
}

const VALID_BBOX = '?north=57.2&south=57.0&east=-3.7&west=-3.9';

describe('GET /api/search', () => {
  let db: Database;
  beforeEach(() => {
    db = openDb(':memory:');
  });
  afterEach(() => db.close());

  it('400 on missing bbox', async () => {
    const { app } = makeApp(db, []);
    const res = await request(app).get('/api/search');
    expect(res.status).toBe(400);
  });

  it('400 on inverted bbox', async () => {
    const { app } = makeApp(db, []);
    const res = await request(app).get('/api/search?north=1&south=2&east=1&west=0');
    expect(res.status).toBe(400);
  });

  it('cache miss → dispatcher called, candidates returned, cached=false', async () => {
    const results = [fakeResult('airbnb', '1'), fakeResult('booking', '2')];
    const { app, dispatcher } = makeApp(db, results);
    const res = await request(app).get(`/api/search${VALID_BBOX}`);
    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(false);
    expect(res.body.candidates).toHaveLength(2);
    expect(dispatcher.search).toHaveBeenCalledTimes(1);
  });

  it('cache hit on second call → dispatcher NOT called twice', async () => {
    const { app, dispatcher } = makeApp(db, [fakeResult('airbnb', '1')]);
    await request(app).get(`/api/search${VALID_BBOX}`);
    const res = await request(app).get(`/api/search${VALID_BBOX}`);
    expect(res.body.cached).toBe(true);
    expect(res.body.candidates).toHaveLength(1);
    expect(dispatcher.search).toHaveBeenCalledTimes(1);
  });

  it('partial-results: warnings header set when a provider fails', async () => {
    const { app } = makeApp(
      db,
      [fakeResult('airbnb', '1')],
      [{ provider: 'booking-diy', message: 'datadome blocked' }],
    );
    const res = await request(app).get(`/api/search${VALID_BBOX}`);
    expect(res.status).toBe(200);
    expect(res.headers['x-search-warnings']).toContain('booking-diy');
    expect(res.body.warnings).toHaveLength(1);
  });
});

describe('POST /api/candidates/:id/promote', () => {
  let db: Database;
  beforeEach(() => {
    db = openDb(':memory:');
  });
  afterEach(() => db.close());

  it('404 for unknown candidate id', async () => {
    const { app } = makeApp(db, []);
    const res = await request(app).post('/api/candidates/9999/promote');
    expect(res.status).toBe(404);
  });

  it('promotes a candidate and returns the new property', async () => {
    const { app } = makeApp(db, [fakeResult('airbnb', '101')]);
    const search = await request(app).get(`/api/search${VALID_BBOX}`);
    const candidateId = search.body.candidates[0].id;

    const promoted = await request(app).post(`/api/candidates/${candidateId}/promote`);
    expect(promoted.status).toBe(200);
    expect(promoted.body.property.provider).toBe('airbnb');
    expect(promoted.body.property.externalId).toBe('101');

    const props = await request(app).get('/api/properties');
    expect(props.body).toHaveLength(1);
    expect(props.body[0].id).toBe(promoted.body.property.id);
  });

  it('promoting twice is idempotent', async () => {
    const { app } = makeApp(db, [fakeResult('airbnb', '202')]);
    const search = await request(app).get(`/api/search${VALID_BBOX}`);
    const cid = search.body.candidates[0].id;
    const a = await request(app).post(`/api/candidates/${cid}/promote`);
    const b = await request(app).post(`/api/candidates/${cid}/promote`);
    expect(a.body.property.id).toBe(b.body.property.id);
  });
});
