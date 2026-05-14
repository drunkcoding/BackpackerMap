import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from 'better-sqlite3';
import { openDb } from '../../src/db/repo.ts';
import {
  createOrsClient,
  getCachedDrivingDistance,
  OrsRequestError,
  RateLimitedError,
  type LatLng,
} from '../../src/routing/ors.ts';

const FIXTURE = JSON.parse(
  readFileSync(join(process.cwd(), 'tests', 'fixtures', 'ors', 'route.sample.json'), 'utf8'),
);

function okResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function errorResponse(status: number, body = 'error'): Response {
  return new Response(body, { status });
}

const PROP_COORDS: LatLng = { lat: 56.7867, lng: -5.0035 };
const TRAIL_COORDS: LatLng = { lat: 57.0, lng: -3.7 };

describe('ORS client', () => {
  it('parses meters/seconds from a successful response', async () => {
    const fetchImpl = vi.fn(async () => okResponse(FIXTURE));
    const client = createOrsClient({
      apiKey: 'test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: () => 0,
    });
    const result = await client.getDrivingDistance(PROP_COORDS, TRAIL_COORDS);
    expect(result).toEqual({ meters: 42000, seconds: 2280 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries up to 3 times on 5xx then throws', async () => {
    const fetchImpl = vi.fn(async () => errorResponse(503, 'upstream down'));
    const client = createOrsClient({
      apiKey: 'test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: () => 0,
    });
    await expect(client.getDrivingDistance(PROP_COORDS, TRAIL_COORDS)).rejects.toThrowError(
      OrsRequestError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('throws RateLimitedError on 429 without retrying', async () => {
    const fetchImpl = vi.fn(async () => errorResponse(429, 'rate limited'));
    const client = createOrsClient({
      apiKey: 'test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: () => 0,
    });
    await expect(client.getDrivingDistance(PROP_COORDS, TRAIL_COORDS)).rejects.toThrowError(
      RateLimitedError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('getCachedDrivingDistance', () => {
  let db: Database;
  beforeEach(() => {
    db = openDb(':memory:');
    db.exec("INSERT INTO source (kind) VALUES ('alltrails'), ('airbnb')");
    db.exec(`
      INSERT INTO trail (source_id, external_id, name, trailhead_lat, trailhead_lng, geojson, raw_path)
      VALUES (1, 't1.gpx', 'T1', 57.0, -3.7, '{}', '/tmp/t1.gpx');
    `);
    db.exec(`
      INSERT INTO property (source_id, provider, external_id, name, url, lat, lng, raw_json)
      VALUES (2, 'airbnb', 'P1', 'P1', 'https://example.com', 56.7867, -5.0035, '{}');
    `);
  });
  afterEach(() => db.close());

  const coordsLookup = () => ({ from: PROP_COORDS, to: TRAIL_COORDS });

  it('miss -> fetch + store; second call -> cached hit, no fetch', async () => {
    const client = { getDrivingDistance: vi.fn(async () => ({ meters: 42000, seconds: 2280 })) };
    const first = await getCachedDrivingDistance(db, 1, 'trail', 1, {
      client,
      getCoords: coordsLookup,
    });
    expect(first).toEqual({ meters: 42000, seconds: 2280, cached: false, viaCarpark: null });
    expect(client.getDrivingDistance).toHaveBeenCalledTimes(1);

    const second = await getCachedDrivingDistance(db, 1, 'trail', 1, {
      client,
      getCoords: coordsLookup,
    });
    expect(second).toEqual({ meters: 42000, seconds: 2280, cached: true, viaCarpark: null });
    expect(client.getDrivingDistance).toHaveBeenCalledTimes(1);
  });

  it('aged cache entries are still returned (no TTL in v1)', async () => {
    db.prepare(
      `INSERT INTO route_cache (property_id, target_kind, target_id, meters, seconds, computed_at)
       VALUES (?, ?, ?, ?, ?, datetime('now', '-30 day'))`,
    ).run(1, 'trail', 1, 100, 60);

    const client = { getDrivingDistance: vi.fn(async () => ({ meters: 0, seconds: 0 })) };
    const result = await getCachedDrivingDistance(db, 1, 'trail', 1, {
      client,
      getCoords: coordsLookup,
    });
    expect(result.meters).toBe(100);
    expect(result.cached).toBe(true);
    expect(client.getDrivingDistance).not.toHaveBeenCalled();
  });
});
