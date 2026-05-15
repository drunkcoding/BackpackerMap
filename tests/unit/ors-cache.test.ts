import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from 'better-sqlite3';
import {
  getCandidateRoute,
  getRoute,
  openDb,
  setCandidateRoute,
  setRoute,
  type TargetKind,
} from '../../src/db/repo.ts';
import {
  type CachedRouteRow,
  createOrsClient,
  getCachedDrivingDistance,
  OrsRequestError,
  RateLimitedError,
  type LatLng,
} from '../../src/routing/ors.ts';

function propertyCacheDeps(db: Database): {
  cacheGet: (id: number, kind: TargetKind, tId: number) => CachedRouteRow | null;
  cacheSet: (id: number, kind: TargetKind, tId: number, row: CachedRouteRow) => void;
} {
  return {
    cacheGet: (id, kind, tId) => {
      const r = getRoute(db, id, kind, tId);
      if (!r) return null;
      return {
        meters: r.meters,
        seconds: r.seconds,
        viaCarparkLat: r.viaCarparkLat,
        viaCarparkLng: r.viaCarparkLng,
        geometry: r.geometry,
      };
    },
    cacheSet: (id, kind, tId, row) => {
      const vc =
        row.viaCarparkLat !== null && row.viaCarparkLng !== null
          ? { lat: row.viaCarparkLat, lng: row.viaCarparkLng }
          : null;
      setRoute(db, id, kind, tId, row.meters, row.seconds, vc, row.geometry);
    },
  };
}

function candidateCacheDeps(db: Database): {
  cacheGet: (id: number, kind: TargetKind, tId: number) => CachedRouteRow | null;
  cacheSet: (id: number, kind: TargetKind, tId: number, row: CachedRouteRow) => void;
} {
  return {
    cacheGet: (id, kind, tId) => {
      const r = getCandidateRoute(db, id, kind, tId);
      if (!r) return null;
      return {
        meters: r.meters,
        seconds: r.seconds,
        viaCarparkLat: r.viaCarparkLat,
        viaCarparkLng: r.viaCarparkLng,
        geometry: r.geometry,
      };
    },
    cacheSet: (id, kind, tId, row) => {
      const vc =
        row.viaCarparkLat !== null && row.viaCarparkLng !== null
          ? { lat: row.viaCarparkLat, lng: row.viaCarparkLng }
          : null;
      setCandidateRoute(db, id, kind, tId, row.meters, row.seconds, vc, row.geometry);
    },
  };
}

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
    expect(result.meters).toBe(42000);
    expect(result.seconds).toBe(2280);
    expect(result.geometry).toEqual([
      [-5.0035, 56.7867],
      [-4.5, 56.9],
      [-3.7, 57.0],
    ]);
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
  const sampleGeometry: [number, number][] = [
    [-5.0035, 56.7867],
    [-3.7, 57.0],
  ];

  it('miss -> fetch + store; second call -> cached hit with same geometry, no fetch', async () => {
    const client = {
      getDrivingDistance: vi.fn(async () => ({
        meters: 42000,
        seconds: 2280,
        geometry: sampleGeometry,
      })),
    };
    const first = await getCachedDrivingDistance(1, 'trail', 1, {
      client,
      getCoords: coordsLookup,
      ...propertyCacheDeps(db),
    });
    expect(first).toEqual({
      meters: 42000,
      seconds: 2280,
      cached: false,
      viaCarpark: null,
      geometry: sampleGeometry,
    });
    expect(client.getDrivingDistance).toHaveBeenCalledTimes(1);

    const second = await getCachedDrivingDistance(1, 'trail', 1, {
      client,
      getCoords: coordsLookup,
      ...propertyCacheDeps(db),
    });
    expect(second).toEqual({
      meters: 42000,
      seconds: 2280,
      cached: true,
      viaCarpark: null,
      geometry: sampleGeometry,
    });
    expect(client.getDrivingDistance).toHaveBeenCalledTimes(1);
  });

  it('cached row without geometry returns null geometry (pre-migration row)', async () => {
    db.prepare(
      `INSERT INTO route_cache (property_id, target_kind, target_id, meters, seconds, computed_at)
       VALUES (?, ?, ?, ?, ?, datetime('now', '-30 day'))`,
    ).run(1, 'trail', 1, 100, 60);

    const client = {
      getDrivingDistance: vi.fn(async () => ({ meters: 0, seconds: 0, geometry: null })),
    };
    const result = await getCachedDrivingDistance(1, 'trail', 1, {
      client,
      getCoords: coordsLookup,
      ...propertyCacheDeps(db),
    });
    expect(result.meters).toBe(100);
    expect(result.cached).toBe(true);
    expect(result.geometry).toBeNull();
    expect(client.getDrivingDistance).not.toHaveBeenCalled();
  });

  it('candidate cache: miss -> fetch + store; hit -> no fetch (parallel to property path)', async () => {
    db.exec(`
      INSERT INTO candidate (provider, external_id, name, url, lat, lng, raw_json)
      VALUES ('airbnb', 'cand1', 'Cand', 'https://example.com', 56.0, -5.0, '{}');
    `);
    const candidateId = Number(
      (db.prepare('SELECT id FROM candidate WHERE external_id = ?').get('cand1') as { id: number })
        .id,
    );

    const client = {
      getDrivingDistance: vi.fn(async () => ({
        meters: 14000,
        seconds: 1200,
        geometry: sampleGeometry,
      })),
    };
    const first = await getCachedDrivingDistance(candidateId, 'trail', 1, {
      client,
      getCoords: coordsLookup,
      ...candidateCacheDeps(db),
      fromKindLabel: 'candidate',
    });
    expect(first.cached).toBe(false);
    expect(first.meters).toBe(14000);
    expect(client.getDrivingDistance).toHaveBeenCalledTimes(1);

    const second = await getCachedDrivingDistance(candidateId, 'trail', 1, {
      client,
      getCoords: coordsLookup,
      ...candidateCacheDeps(db),
      fromKindLabel: 'candidate',
    });
    expect(second.cached).toBe(true);
    expect(second.meters).toBe(14000);
    expect(second.geometry).toEqual(sampleGeometry);
    expect(client.getDrivingDistance).toHaveBeenCalledTimes(1);

    expect(getCandidateRoute(db, candidateId, 'trail', 1)).not.toBeNull();
    expect(getRoute(db, candidateId, 'trail', 1)).toBeNull();
  });

  it('throws unknown candidate/<kind> when getCoords returns null and fromKindLabel=candidate', async () => {
    const client = {
      getDrivingDistance: vi.fn(async () => ({ meters: 0, seconds: 0, geometry: null })),
    };
    await expect(
      getCachedDrivingDistance(99, 'trail', 99, {
        client,
        getCoords: () => null,
        ...candidateCacheDeps(db),
        fromKindLabel: 'candidate',
      }),
    ).rejects.toThrowError('unknown candidate/trail pair: 99/99');
    expect(client.getDrivingDistance).not.toHaveBeenCalled();
  });
});
