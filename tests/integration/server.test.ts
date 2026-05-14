import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Database } from 'better-sqlite3';
import { openDb, getPoiCarpark } from '../../src/db/repo.ts';
import { createApp } from '../../src/server/app.ts';
import { NoRoutableRouteError, type LatLng } from '../../src/routing/ors.ts';
import type { OverpassClient } from '../../src/routing/overpass.ts';

function seed(db: Database): { propertyId: number; trailId: number; poiId: number } {
  db.exec("INSERT INTO source (kind) VALUES ('alltrails'), ('airbnb'), ('google_maps')");
  db.exec(`
    INSERT INTO trail (source_id, external_id, name, trailhead_lat, trailhead_lng, length_meters, elevation_gain_meters, geojson, raw_path)
    VALUES (1, 't1.gpx', 'Loch an Eilein', 57.1, -3.8, 8400, 320, '{"type":"LineString","coordinates":[[-3.8,57.1],[-3.79,57.11]]}', '/tmp/t1.gpx');
  `);
  db.exec(`
    INSERT INTO property (source_id, provider, external_id, name, url, lat, lng, price_label, photo_url, raw_json)
    VALUES (2, 'airbnb', '12345', 'Cairngorms cabin', 'https://www.airbnb.com/rooms/12345',
            56.7867, -5.0035, '£142 / night', 'https://example.com/photo.jpg', '{}');
  `);
  db.exec(`
    INSERT INTO property (source_id, provider, external_id, name, url, lat, lng, raw_json)
    VALUES (2, 'airbnb', 'no-coords', 'No coords listing', 'https://www.airbnb.com/rooms/no-coords',
            NULL, NULL, '{}');
  `);
  db.exec(`
    INSERT INTO poi (source_id, collection, external_id, name, lat, lng, note, address, raw)
    VALUES (3, 'Scotland 2026', 'ChIJ_test1', 'The Drovers Inn',
            56.2710, -4.7150, 'great rest stop', 'Inverarnan, UK', '{}');
  `);
  return { propertyId: 1, trailId: 1, poiId: 1 };
}

describe('HTTP API', () => {
  let db: Database;
  let orsCalls: number;
  const ors = {
    getDrivingDistance: vi.fn(async (_from: LatLng, _to: LatLng) => {
      orsCalls++;
      return { meters: 42000, seconds: 2280 };
    }),
  };

  beforeEach(() => {
    db = openDb(':memory:');
    orsCalls = 0;
    ors.getDrivingDistance.mockClear();
  });

  afterEach(() => db.close());

  it('GET /healthz returns 200 ok', async () => {
    const app = createApp({ db, ors });
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('GET /api/properties returns seeded rows with coords only', async () => {
    seed(db);
    const app = createApp({ db, ors });
    const res = await request(app).get('/api/properties');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      provider: 'airbnb',
      externalId: '12345',
      name: 'Cairngorms cabin',
      lat: 56.7867,
      lng: -5.0035,
    });
  });

  it('GET /api/trails/:id returns 404 for unknown id', async () => {
    const app = createApp({ db, ors });
    const res = await request(app).get('/api/trails/9999');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'trail not found' });
  });

  it('GET /api/distance cache miss -> ORS called once; second call -> cache hit, no ORS', async () => {
    const { propertyId, trailId } = seed(db);
    const app = createApp({ db, ors });

    const first = await request(app).get(
      `/api/distance?propertyId=${propertyId}&trailId=${trailId}`,
    );
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ meters: 42000, seconds: 2280, cached: false });
    expect(orsCalls).toBe(1);

    const second = await request(app).get(
      `/api/distance?propertyId=${propertyId}&trailId=${trailId}`,
    );
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ meters: 42000, seconds: 2280, cached: true });
    expect(orsCalls).toBe(1);
  });

  it('GET /api/distance returns 404 when property has no coords', async () => {
    seed(db);
    const app = createApp({ db, ors });
    const res = await request(app).get('/api/distance?propertyId=2&trailId=1');
    expect(res.status).toBe(404);
  });

  it('GET /api/trails/:id returns parsed geojson', async () => {
    seed(db);
    const app = createApp({ db, ors });
    const res = await request(app).get('/api/trails/1');
    expect(res.status).toBe(200);
    expect(res.body.geojson).toEqual({
      type: 'LineString',
      coordinates: [
        [-3.8, 57.1],
        [-3.79, 57.11],
      ],
    });
  });

  it('GET /api/pois returns seeded POI rows', async () => {
    seed(db);
    const app = createApp({ db, ors });
    const res = await request(app).get('/api/pois');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      collection: 'Scotland 2026',
      name: 'The Drovers Inn',
      lat: 56.271,
      lng: -4.715,
      note: 'great rest stop',
    });
  });

  it('GET /api/distance with targetKind=poi works end-to-end', async () => {
    const { propertyId, poiId } = seed(db);
    const app = createApp({ db, ors });
    const res = await request(app).get(
      `/api/distance?propertyId=${propertyId}&targetKind=poi&targetId=${poiId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ meters: 42000, seconds: 2280, cached: false });
  });

  it('GET /api/distance with targetKind=trail&targetId works (explicit new shape)', async () => {
    const { propertyId, trailId } = seed(db);
    const app = createApp({ db, ors });
    const res = await request(app).get(
      `/api/distance?propertyId=${propertyId}&targetKind=trail&targetId=${trailId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.meters).toBe(42000);
  });

  it('GET /api/distance with invalid targetKind returns 400', async () => {
    seed(db);
    const app = createApp({ db, ors });
    const res = await request(app).get('/api/distance?propertyId=1&targetKind=bogus&targetId=1');
    expect(res.status).toBe(400);
  });

  it('GET /api/distance for poi target separates cache from trail target', async () => {
    const { propertyId, trailId, poiId } = seed(db);
    const app = createApp({ db, ors });

    const trailCall = await request(app).get(
      `/api/distance?propertyId=${propertyId}&targetKind=trail&targetId=${trailId}`,
    );
    expect(trailCall.body.cached).toBe(false);
    expect(orsCalls).toBe(1);

    const poiCall = await request(app).get(
      `/api/distance?propertyId=${propertyId}&targetKind=poi&targetId=${poiId}`,
    );
    expect(poiCall.body.cached).toBe(false);
    expect(orsCalls).toBe(2);

    const trailAgain = await request(app).get(
      `/api/distance?propertyId=${propertyId}&targetKind=trail&targetId=${trailId}`,
    );
    expect(trailAgain.body.cached).toBe(true);
    expect(orsCalls).toBe(2);
  });

  it('DELETE /api/properties/:id removes a saved property', async () => {
    const { propertyId } = seed(db);
    const app = createApp({ db, ors });

    const before = await request(app).get('/api/properties');
    expect(before.body.map((p: { id: number }) => p.id)).toContain(propertyId);

    const del = await request(app).delete(`/api/properties/${propertyId}`);
    expect(del.status).toBe(204);

    const after = await request(app).get('/api/properties');
    expect(after.body.map((p: { id: number }) => p.id)).not.toContain(propertyId);
  });

  it('DELETE /api/properties/:id returns 404 for an unknown id', async () => {
    seed(db);
    const app = createApp({ db, ors });
    const res = await request(app).delete('/api/properties/99999');
    expect(res.status).toBe(404);
  });

  it('DELETE /api/properties/:id returns 400 for a non-integer id', async () => {
    seed(db);
    const app = createApp({ db, ors });
    const res = await request(app).delete('/api/properties/not-a-number');
    expect(res.status).toBe(400);
  });

  it('DELETE /api/properties/:id cascades route cache cleanup', async () => {
    const { propertyId, trailId } = seed(db);
    const app = createApp({ db, ors });

    await request(app).get(
      `/api/distance?propertyId=${propertyId}&targetKind=trail&targetId=${trailId}`,
    );
    const cachedBefore = db
      .prepare<[number], { c: number }>(
        'SELECT COUNT(*) AS c FROM route_cache WHERE property_id = ?',
      )
      .get(propertyId);
    expect(cachedBefore!.c).toBe(1);

    await request(app).delete(`/api/properties/${propertyId}`);
    const cachedAfter = db
      .prepare<[number], { c: number }>(
        'SELECT COUNT(*) AS c FROM route_cache WHERE property_id = ?',
      )
      .get(propertyId);
    expect(cachedAfter!.c).toBe(0);
  });
});

describe('GET /api/distance — carpark fallback (POI 422 path)', () => {
  let db: Database;

  beforeEach(() => {
    db = openDb(':memory:');
  });
  afterEach(() => db.close());

  it('on POI 422, queries Overpass, retries ORS to carpark, returns viaCarpark', async () => {
    const { propertyId, poiId } = seed(db);

    const ors = {
      getDrivingDistance: vi
        .fn<(from: LatLng, to: LatLng) => Promise<{ meters: number; seconds: number }>>()
        .mockRejectedValueOnce(new NoRoutableRouteError('point not near road'))
        .mockResolvedValueOnce({ meters: 9000, seconds: 720 }),
    };
    const overpass: OverpassClient = {
      findNearestCarpark: vi.fn(async () => ({
        point: { lat: 56.2702, lng: -4.7141 },
        radiusMeters: 1000,
      })),
    };
    const app = createApp({ db, ors, overpass });

    const res = await request(app).get(
      `/api/distance?propertyId=${propertyId}&targetKind=poi&targetId=${poiId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      meters: 9000,
      seconds: 720,
      cached: false,
      viaCarpark: { lat: 56.2702, lng: -4.7141 },
    });
    expect(ors.getDrivingDistance).toHaveBeenCalledTimes(2);
    expect(overpass.findNearestCarpark).toHaveBeenCalledTimes(1);

    const stored = getPoiCarpark(db, poiId);
    expect(stored).toMatchObject({ lat: 56.2702, lng: -4.7141, radiusMeters: 1000 });
  });

  it('cached carpark route returns viaCarpark on second call without ORS or Overpass', async () => {
    const { propertyId, poiId } = seed(db);

    const ors = {
      getDrivingDistance: vi
        .fn<(from: LatLng, to: LatLng) => Promise<{ meters: number; seconds: number }>>()
        .mockRejectedValueOnce(new NoRoutableRouteError('point not near road'))
        .mockResolvedValueOnce({ meters: 9000, seconds: 720 }),
    };
    const overpass: OverpassClient = {
      findNearestCarpark: vi.fn(async () => ({
        point: { lat: 56.2702, lng: -4.7141 },
        radiusMeters: 1000,
      })),
    };
    const app = createApp({ db, ors, overpass });

    await request(app).get(
      `/api/distance?propertyId=${propertyId}&targetKind=poi&targetId=${poiId}`,
    );

    const second = await request(app).get(
      `/api/distance?propertyId=${propertyId}&targetKind=poi&targetId=${poiId}`,
    );
    expect(second.status).toBe(200);
    expect(second.body).toEqual({
      meters: 9000,
      seconds: 720,
      cached: true,
      viaCarpark: { lat: 56.2702, lng: -4.7141 },
    });
    expect(ors.getDrivingDistance).toHaveBeenCalledTimes(2);
    expect(overpass.findNearestCarpark).toHaveBeenCalledTimes(1);
  });

  it('returns 422 when Overpass finds no carpark within max radius', async () => {
    const { propertyId, poiId } = seed(db);

    const ors = {
      getDrivingDistance: vi
        .fn<(from: LatLng, to: LatLng) => Promise<{ meters: number; seconds: number }>>()
        .mockRejectedValue(new NoRoutableRouteError('point not near road')),
    };
    const overpass: OverpassClient = {
      findNearestCarpark: vi.fn(async () => null),
    };
    const app = createApp({ db, ors, overpass });

    const res = await request(app).get(
      `/api/distance?propertyId=${propertyId}&targetKind=poi&targetId=${poiId}`,
    );
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('no driving route');
    expect(overpass.findNearestCarpark).toHaveBeenCalledTimes(1);

    const stored = getPoiCarpark(db, poiId);
    expect(stored).not.toBeNull();
    expect(stored!.lat).toBeNull();
    expect(stored!.lng).toBeNull();
  });

  it('returns 422 when the second-leg ORS call (to carpark) also fails', async () => {
    const { propertyId, poiId } = seed(db);

    const ors = {
      getDrivingDistance: vi
        .fn<(from: LatLng, to: LatLng) => Promise<{ meters: number; seconds: number }>>()
        .mockRejectedValueOnce(new NoRoutableRouteError('first leg'))
        .mockRejectedValueOnce(new NoRoutableRouteError('carpark also unreachable')),
    };
    const overpass: OverpassClient = {
      findNearestCarpark: vi.fn(async () => ({
        point: { lat: 56.2702, lng: -4.7141 },
        radiusMeters: 1000,
      })),
    };
    const app = createApp({ db, ors, overpass });

    const res = await request(app).get(
      `/api/distance?propertyId=${propertyId}&targetKind=poi&targetId=${poiId}`,
    );
    expect(res.status).toBe(422);
    expect(ors.getDrivingDistance).toHaveBeenCalledTimes(2);
  });

  it('skips carpark fallback entirely for trail targets', async () => {
    const { propertyId, trailId } = seed(db);

    const ors = {
      getDrivingDistance: vi
        .fn<(from: LatLng, to: LatLng) => Promise<{ meters: number; seconds: number }>>()
        .mockRejectedValue(new NoRoutableRouteError('off road')),
    };
    const overpass: OverpassClient = {
      findNearestCarpark: vi.fn(),
    };
    const app = createApp({ db, ors, overpass });

    const res = await request(app).get(
      `/api/distance?propertyId=${propertyId}&targetKind=trail&targetId=${trailId}`,
    );
    expect(res.status).toBe(422);
    expect(overpass.findNearestCarpark).not.toHaveBeenCalled();
  });

  it('skips carpark fallback when overpass dep is not provided', async () => {
    const { propertyId, poiId } = seed(db);

    const ors = {
      getDrivingDistance: vi
        .fn<(from: LatLng, to: LatLng) => Promise<{ meters: number; seconds: number }>>()
        .mockRejectedValue(new NoRoutableRouteError('off road')),
    };
    const app = createApp({ db, ors });

    const res = await request(app).get(
      `/api/distance?propertyId=${propertyId}&targetKind=poi&targetId=${poiId}`,
    );
    expect(res.status).toBe(422);
  });
});
