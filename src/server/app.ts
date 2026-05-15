import { existsSync, statSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
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
  getRoute,
  getCandidateRoute,
  setCandidateRoute,
} from '../db/repo.ts';
import {
  getCachedDrivingDistance,
  type CachedRouteRow,
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
  webDistDir?: string;
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
    const hasPropertyId = req.query['propertyId'] !== undefined;
    const hasCandidateId = req.query['candidateId'] !== undefined;
    if (hasPropertyId && hasCandidateId) {
      res.status(400).json({ error: 'pass exactly one of propertyId or candidateId' });
      return;
    }
    if (!hasPropertyId && !hasCandidateId) {
      res.status(400).json({ error: 'propertyId or candidateId required' });
      return;
    }

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
    if (!Number.isInteger(targetId)) {
      res.status(400).json({ error: 'target id must be an integer' });
      return;
    }

    const fromOrigin = hasCandidateId ? 'candidate' : 'property';
    const fromId = Number(req.query[hasCandidateId ? 'candidateId' : 'propertyId']);
    if (!Number.isInteger(fromId) || fromId <= 0) {
      res.status(400).json({ error: `${fromOrigin}Id must be a positive integer` });
      return;
    }

    const lookupOriginCoords = (id: number): LatLng | null => {
      if (fromOrigin === 'property') {
        const row = deps.db
          .prepare<
            [number],
            { lat: number | null; lng: number | null }
          >('SELECT lat, lng FROM property WHERE id = ?')
          .get(id);
        if (!row || row.lat === null || row.lng === null) return null;
        return { lat: row.lat, lng: row.lng };
      }
      const row = deps.db
        .prepare<[number], { lat: number; lng: number }>('SELECT lat, lng FROM candidate WHERE id = ?')
        .get(id);
      if (!row) return null;
      return { lat: row.lat, lng: row.lng };
    };

    const originCoords = lookupOriginCoords(fromId);
    if (!originCoords) {
      res.status(404).json({ error: `${fromOrigin} not found` });
      return;
    }

    const cacheDeps =
      fromOrigin === 'property'
        ? makePropertyCacheDeps(deps.db)
        : makeCandidateCacheDeps(deps.db);

    const lookupTargetCoords = (tKind: 'trail' | 'poi', tId: number): LatLng | null => {
      if (tKind === 'trail') {
        const tRow = deps.db
          .prepare<
            [number],
            { trailhead_lat: number; trailhead_lng: number }
          >('SELECT trailhead_lat, trailhead_lng FROM trail WHERE id = ?')
          .get(tId);
        if (!tRow) return null;
        return { lat: tRow.trailhead_lat, lng: tRow.trailhead_lng };
      }
      const poiRow = deps.db
        .prepare<[number], { lat: number; lng: number }>('SELECT lat, lng FROM poi WHERE id = ?')
        .get(tId);
      if (!poiRow) return null;
      return { lat: poiRow.lat, lng: poiRow.lng };
    };

    try {
      const result = await getCachedDrivingDistance(fromId, targetKind, targetId, {
        client: deps.ors,
        getCoords: (_id, tKind, tId) => {
          const to = lookupTargetCoords(tKind, tId);
          if (!to) return null;
          return { from: originCoords, to };
        },
        cacheGet: cacheDeps.cacheGet,
        cacheSet: cacheDeps.cacheSet,
        fromKindLabel: fromOrigin,
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
            const poiCoords = lookupTargetCoords('poi', targetId);
            if (poiCoords) {
              const viaResult = await tryCarparkFallback(
                deps.db,
                deps.ors,
                deps.overpass,
                { kind: fromOrigin, id: fromId, from: originCoords },
                { id: targetId, coords: poiCoords },
                cacheDeps.cacheSet,
              );
              if (viaResult) {
                res.json(serializeDistance(viaResult));
                return;
              }
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

  if (deps.webDistDir) {
    const distDir = resolvePath(deps.webDistDir);
    if (existsSync(distDir) && statSync(distDir).isDirectory()) {
      const indexHtml = resolvePath(distDir, 'index.html');
      app.use(express.static(distDir));
      app.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          next();
          return;
        }
        if (req.path.startsWith('/api/') || req.path === '/healthz') {
          next();
          return;
        }
        if (!existsSync(indexHtml)) {
          next();
          return;
        }
        res.sendFile(indexHtml);
      });
      console.log(`[server] serving static web from ${distDir}`);
    } else {
      console.warn(`[server] webDistDir ${distDir} does not exist — skipping static serve`);
    }
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

interface CacheWriter {
  (
    fromId: number,
    targetKind: 'trail' | 'poi',
    targetId: number,
    row: CachedRouteRow,
  ): void;
}

interface CacheDeps {
  cacheGet: (
    fromId: number,
    targetKind: 'trail' | 'poi',
    targetId: number,
  ) => CachedRouteRow | null;
  cacheSet: CacheWriter;
}

function makePropertyCacheDeps(db: Database): CacheDeps {
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
      const viaCarpark =
        row.viaCarparkLat !== null && row.viaCarparkLng !== null
          ? { lat: row.viaCarparkLat, lng: row.viaCarparkLng }
          : null;
      setRoute(db, id, kind, tId, row.meters, row.seconds, viaCarpark, row.geometry);
    },
  };
}

function makeCandidateCacheDeps(db: Database): CacheDeps {
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
      const viaCarpark =
        row.viaCarparkLat !== null && row.viaCarparkLng !== null
          ? { lat: row.viaCarparkLat, lng: row.viaCarparkLng }
          : null;
      setCandidateRoute(db, id, kind, tId, row.meters, row.seconds, viaCarpark, row.geometry);
    },
  };
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
  origin: { kind: 'property' | 'candidate'; id: number; from: LatLng },
  poi: { id: number; coords: LatLng },
  cacheSet: CacheWriter,
): Promise<DistanceFallbackResult | null> {
  const cached = getPoiCarpark(db, poi.id);
  let carpark: { lat: number; lng: number } | null;
  if (cached) {
    if (cached.lat === null || cached.lng === null) return null;
    carpark = { lat: cached.lat, lng: cached.lng };
  } else {
    const found = await overpass.findNearestCarpark(poi.coords, RADII_METERS);
    if (!found) {
      setPoiCarpark(db, poi.id, null, null, RADII_METERS[RADII_METERS.length - 1] ?? 0);
      return null;
    }
    setPoiCarpark(db, poi.id, found.point.lat, found.point.lng, found.radiusMeters);
    carpark = found.point;
  }

  try {
    const fresh = await ors.getDrivingDistance(origin.from, { lat: carpark.lat, lng: carpark.lng });
    const serialized = fresh.geometry ? JSON.stringify(fresh.geometry) : null;
    cacheSet(origin.id, 'poi', poi.id, {
      meters: fresh.meters,
      seconds: fresh.seconds,
      viaCarparkLat: carpark.lat,
      viaCarparkLng: carpark.lng,
      geometry: serialized,
    });
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
