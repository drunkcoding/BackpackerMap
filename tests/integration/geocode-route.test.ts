import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { openDb } from '../../src/db/repo.ts';
import { createApp } from '../../src/server/app.ts';
import type { PhotonClient, GeocodeResult } from '../../src/server/geocode/photon.ts';
import type { PolygonFetcher } from '../../src/server/geocode/polygon.ts';

function makeApp(opts: { photon: PhotonClient; polygon: PolygonFetcher }) {
  const db = openDb(':memory:');
  return createApp({
    db,
    ors: { getDrivingDistance: async () => ({ meters: 0, seconds: 0, geometry: null }) },
    photon: opts.photon,
    polygon: opts.polygon,
  });
}

const SAMPLE_RESULT: GeocodeResult = {
  id: 'R:1234',
  osmType: 'R',
  osmId: 1234,
  name: 'Edinburgh',
  label: 'Edinburgh, Scotland, United Kingdom',
  kind: 'city',
  center: { lat: 55.95, lng: -3.19 },
  bbox: { north: 55.99, south: 55.89, east: -3.07, west: -3.32 },
  hasPolygon: true,
};

describe('GET /api/geocode', () => {
  it('returns empty results for queries shorter than 2 chars', async () => {
    const photon: PhotonClient = { search: vi.fn(async () => []) };
    const polygon: PolygonFetcher = {
      fetchPolygon: async () => ({ osmType: 'R', osmId: 0, geometry: null }),
    };
    const app = makeApp({ photon, polygon });

    const res = await request(app).get('/api/geocode?q=');
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
    const res2 = await request(app).get('/api/geocode?q=a');
    expect(res2.body.results).toEqual([]);
  });

  it('returns normalised results from the Photon client', async () => {
    const photon: PhotonClient = { search: vi.fn(async () => [SAMPLE_RESULT]) };
    const polygon: PolygonFetcher = {
      fetchPolygon: async () => ({ osmType: 'R', osmId: 0, geometry: null }),
    };
    const app = makeApp({ photon, polygon });
    const res = await request(app).get('/api/geocode?q=edinburgh');
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].name).toBe('Edinburgh');
    expect(res.body.results[0].hasPolygon).toBe(true);
  });

  it('returns 502 when Photon throws', async () => {
    const photon: PhotonClient = {
      search: vi.fn(async () => {
        throw new Error('upstream blew up');
      }),
    };
    const polygon: PolygonFetcher = {
      fetchPolygon: async () => ({ osmType: 'R', osmId: 0, geometry: null }),
    };
    const app = makeApp({ photon, polygon });
    const res = await request(app).get('/api/geocode?q=edinburgh');
    expect(res.status).toBe(502);
  });
});

describe('GET /api/geocode/polygon', () => {
  it('400 for missing osm_type or osm_id', async () => {
    const photon: PhotonClient = { search: vi.fn(async () => []) };
    const polygon: PolygonFetcher = {
      fetchPolygon: async () => ({ osmType: 'R', osmId: 0, geometry: null }),
    };
    const app = makeApp({ photon, polygon });
    const a = await request(app).get('/api/geocode/polygon?osm_id=1');
    expect(a.status).toBe(400);
    const b = await request(app).get('/api/geocode/polygon?osm_type=R');
    expect(b.status).toBe(400);
    const c = await request(app).get('/api/geocode/polygon?osm_type=X&osm_id=1');
    expect(c.status).toBe(400);
  });

  it('returns the geometry from the PolygonFetcher', async () => {
    const geom = { type: 'Polygon' as const, coordinates: [[[0, 0]]] };
    const photon: PhotonClient = { search: vi.fn(async () => []) };
    const polygon: PolygonFetcher = {
      fetchPolygon: async (osmType, osmId) => ({ osmType, osmId, geometry: geom }),
    };
    const app = makeApp({ photon, polygon });
    const res = await request(app).get('/api/geocode/polygon?osm_type=R&osm_id=1234');
    expect(res.status).toBe(200);
    expect(res.body.geometry).toEqual(geom);
    expect(res.body.osmId).toBe(1234);
  });

  it('404 when geometry is null (no polygon available)', async () => {
    const photon: PhotonClient = { search: vi.fn(async () => []) };
    const polygon: PolygonFetcher = {
      fetchPolygon: async () => ({ osmType: 'R', osmId: 1, geometry: null }),
    };
    const app = makeApp({ photon, polygon });
    const res = await request(app).get('/api/geocode/polygon?osm_type=R&osm_id=1');
    expect(res.status).toBe(404);
  });
});
