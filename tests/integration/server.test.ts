import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Database } from 'better-sqlite3';
import { openDb } from '../../src/db/repo.ts';
import { createApp } from '../../src/server/app.ts';
import type { LatLng } from '../../src/routing/ors.ts';

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
});
