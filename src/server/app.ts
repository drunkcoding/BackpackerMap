import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import type { Database } from 'better-sqlite3';
import {
  deleteProperty,
  listProperties,
  listPois,
  getPoiCarpark,
  setPoiCarpark,
  setRoute,
} from '../db/repo.ts';
import {
  getCachedDrivingDistance,
  type LatLng,
  RateLimitedError,
  OrsRequestError,
  NoRoutableRouteError,
} from '../routing/ors.ts';
import type { OverpassClient } from '../routing/overpass.ts';
import { RADII_METERS } from '../routing/overpass.ts';
import { createSearchRouter } from './routes/search.ts';
import { createGeocodeRouter } from './routes/geocode.ts';
import type { SearchDispatcher } from '../search/dispatcher.ts';
import type { PhotonClient } from './geocode/photon.ts';
import type { PolygonFetcher } from './geocode/polygon.ts';

export interface AppDeps {
  db: Database;
  ors: {
    getDrivingDistance(
      from: LatLng,
      to: LatLng,
    ): Promise<{ meters: number; seconds: number; geometry: [number, number][] | null }>;
  };
  overpass?: OverpassClient;
  searchDispatcher?: SearchDispatcher;
  searchCacheTtlMs?: number;
  corsOrigin?: string | string[];
  photon?: PhotonClient;
  polygon?: PolygonFetcher;
}

interface TrailRow {
  id: number;
  name: string;
  trailhead_lat: number;
  trailhead_lng: number;
  length_meters: number | null;
  elevation_gain_meters: number | null;
}

interface TrailDetailRow extends TrailRow {
  geojson: string;
  external_id: string | null;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(cors({ origin: deps.corsOrigin ?? ['http://localhost:5173'] }));
  app.use(express.json());

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/properties', (_req, res) => {
    const props = listProperties(deps.db)
      .filter((p) => p.lat !== null && p.lng !== null)
      .map((p) => ({
        id: p.id,
        provider: p.provider,
        externalId: p.externalId,
        name: p.name,
        url: p.url,
        lat: p.lat,
        lng: p.lng,
        priceLabel: p.priceLabel,
        photoUrl: p.photoUrl,
      }));
    res.json(props);
  });

  app.delete('/api/properties/:id', (req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'invalid property id' });
      return;
    }
    const exists = deps.db
      .prepare<[number], { id: number }>('SELECT id FROM property WHERE id = ?')
      .get(id);
    if (!exists) {
      res.status(404).json({ error: 'property not found' });
      return;
    }
    deleteProperty(deps.db, id);
    res.status(204).end();
  });

  app.get('/api/trails', (_req, res) => {
    const rows = deps.db
      .prepare<
        [],
        TrailRow
      >('SELECT id, name, trailhead_lat, trailhead_lng, length_meters, elevation_gain_meters FROM trail ORDER BY id')
      .all();
    const trails = rows.map((r) => ({
      id: r.id,
      name: r.name,
      trailheadLat: r.trailhead_lat,
      trailheadLng: r.trailhead_lng,
      lengthMeters: r.length_meters,
      elevationGainMeters: r.elevation_gain_meters,
    }));
    res.json(trails);
  });

  app.get('/api/trails/:id', (req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const row = deps.db
      .prepare<[number], TrailDetailRow>('SELECT * FROM trail WHERE id = ?')
      .get(id);
    if (!row) {
      res.status(404).json({ error: 'trail not found' });
      return;
    }
    res.json({
      id: row.id,
      externalId: row.external_id,
      name: row.name,
      trailheadLat: row.trailhead_lat,
      trailheadLng: row.trailhead_lng,
      lengthMeters: row.length_meters,
      elevationGainMeters: row.elevation_gain_meters,
      geojson: JSON.parse(row.geojson) as unknown,
    });
  });

  app.get('/api/pois', (_req, res) => {
    const pois = listPois(deps.db).map((p) => ({
      id: p.id,
      collection: p.collection,
      externalId: p.externalId,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      category: p.category,
      note: p.note,
      url: p.url,
      address: p.address,
    }));
    res.json(pois);
  });

  app.get('/api/distance', async (req: Request, res: Response, next: NextFunction) => {
    const propertyId = Number(req.query['propertyId']);

    let targetKind: 'trail' | 'poi';
    let targetId: number;
    if (req.query['targetKind'] !== undefined || req.query['targetId'] !== undefined) {
      const tk = String(req.query['targetKind'] ?? '');
      if (tk !== 'trail' && tk !== 'poi') {
        res.status(400).json({ error: "targetKind must be 'trail' or 'poi'" });
        return;
      }
      targetKind = tk;
      targetId = Number(req.query['targetId']);
    } else {
      targetKind = 'trail';
      targetId = Number(req.query['trailId']);
    }

    if (!Number.isInteger(propertyId) || !Number.isInteger(targetId)) {
      res.status(400).json({ error: 'propertyId and target id must be integers' });
      return;
    }
    try {
      const result = await getCachedDrivingDistance(deps.db, propertyId, targetKind, targetId, {
        client: deps.ors,
        getCoords: (pId, tKind, tId) => {
          const pRow = deps.db
            .prepare<
              [number],
              { lat: number | null; lng: number | null }
            >('SELECT lat, lng FROM property WHERE id = ?')
            .get(pId);
          if (!pRow || pRow.lat === null || pRow.lng === null) return null;

          if (tKind === 'trail') {
            const tRow = deps.db
              .prepare<
                [number],
                { trailhead_lat: number; trailhead_lng: number }
              >('SELECT trailhead_lat, trailhead_lng FROM trail WHERE id = ?')
              .get(tId);
            if (!tRow) return null;
            return {
              from: { lat: pRow.lat, lng: pRow.lng },
              to: { lat: tRow.trailhead_lat, lng: tRow.trailhead_lng },
            };
          }

          const poiRow = deps.db
            .prepare<
              [number],
              { lat: number; lng: number }
            >('SELECT lat, lng FROM poi WHERE id = ?')
            .get(tId);
          if (!poiRow) return null;
          return {
            from: { lat: pRow.lat, lng: pRow.lng },
            to: { lat: poiRow.lat, lng: poiRow.lng },
          };
        },
      });
      res.json(serializeDistance(result));
    } catch (err) {
      if (err instanceof RateLimitedError) {
        res.status(429).json({ error: err.message });
        return;
      }
      if (err instanceof NoRoutableRouteError) {
        if (targetKind === 'poi' && deps.overpass) {
          try {
            const viaResult = await tryCarparkFallback(
              deps.db,
              deps.ors,
              deps.overpass,
              propertyId,
              targetId,
            );
            if (viaResult) {
              res.json(serializeDistance(viaResult));
              return;
            }
          } catch (innerErr) {
            if (innerErr instanceof RateLimitedError) {
              res.status(429).json({ error: innerErr.message });
              return;
            }
            if (innerErr instanceof OrsRequestError) {
              res.status(502).json({ error: innerErr.message });
              return;
            }
          }
        }
        res.status(422).json({ error: 'no driving route', detail: err.detail });
        return;
      }
      if (err instanceof OrsRequestError) {
        res.status(502).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message.startsWith('unknown')) {
        res.status(404).json({ error: err.message });
        return;
      }
      next(err);
    }
  });

  if (deps.searchDispatcher) {
    app.use(
      '/api',
      createSearchRouter({
        db: deps.db,
        dispatcher: deps.searchDispatcher,
        ...(deps.searchCacheTtlMs !== undefined ? { cacheTtlMs: deps.searchCacheTtlMs } : {}),
      }),
    );
  }

  if (deps.photon && deps.polygon) {
    app.use('/api', createGeocodeRouter({ photon: deps.photon, polygon: deps.polygon }));
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[server] unhandled error:', err);
    res.status(500).json({ error: err.message });
  });

  return app;
}

type RouteGeometry = [number, number][];

interface DistanceResult {
  meters: number;
  seconds: number;
  cached: boolean;
  viaCarpark: { lat: number; lng: number } | null;
  geometry: RouteGeometry | null;
}

interface SerializedDistance {
  meters: number;
  seconds: number;
  cached: boolean;
  viaCarpark?: { lat: number; lng: number };
  geometry?: RouteGeometry;
}

function serializeDistance(r: DistanceResult): SerializedDistance {
  const out: SerializedDistance = { meters: r.meters, seconds: r.seconds, cached: r.cached };
  if (r.viaCarpark !== null) out.viaCarpark = r.viaCarpark;
  if (r.geometry !== null) out.geometry = r.geometry;
  return out;
}

interface DistanceFallbackResult {
  meters: number;
  seconds: number;
  cached: boolean;
  viaCarpark: { lat: number; lng: number };
  geometry: RouteGeometry | null;
}

async function tryCarparkFallback(
  db: Database,
  ors: {
    getDrivingDistance(
      from: LatLng,
      to: LatLng,
    ): Promise<{ meters: number; seconds: number; geometry: RouteGeometry | null }>;
  },
  overpass: OverpassClient,
  propertyId: number,
  poiId: number,
): Promise<DistanceFallbackResult | null> {
  const pRow = db
    .prepare<
      [number],
      { lat: number | null; lng: number | null }
    >('SELECT lat, lng FROM property WHERE id = ?')
    .get(propertyId);
  if (!pRow || pRow.lat === null || pRow.lng === null) return null;
  const poiRow = db
    .prepare<[number], { lat: number; lng: number }>('SELECT lat, lng FROM poi WHERE id = ?')
    .get(poiId);
  if (!poiRow) return null;

  const cached = getPoiCarpark(db, poiId);
  let carpark: { lat: number; lng: number } | null;
  if (cached) {
    if (cached.lat === null || cached.lng === null) return null;
    carpark = { lat: cached.lat, lng: cached.lng };
  } else {
    const found = await overpass.findNearestCarpark(
      { lat: poiRow.lat, lng: poiRow.lng },
      RADII_METERS,
    );
    if (!found) {
      setPoiCarpark(db, poiId, null, null, RADII_METERS[RADII_METERS.length - 1] ?? 0);
      return null;
    }
    setPoiCarpark(db, poiId, found.point.lat, found.point.lng, found.radiusMeters);
    carpark = found.point;
  }

  try {
    const fresh = await ors.getDrivingDistance(
      { lat: pRow.lat, lng: pRow.lng },
      { lat: carpark.lat, lng: carpark.lng },
    );
    const serialized = fresh.geometry ? JSON.stringify(fresh.geometry) : null;
    setRoute(db, propertyId, 'poi', poiId, fresh.meters, fresh.seconds, carpark, serialized);
    return {
      meters: fresh.meters,
      seconds: fresh.seconds,
      cached: false,
      viaCarpark: carpark,
      geometry: fresh.geometry,
    };
  } catch (err) {
    if (err instanceof NoRoutableRouteError) return null;
    throw err;
  }
}
