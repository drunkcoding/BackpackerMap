import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import type { Database } from 'better-sqlite3';
import { listProperties } from '../db/repo.ts';
import {
  getCachedDrivingDistance,
  type LatLng,
  RateLimitedError,
  OrsRequestError,
  NoRoutableRouteError,
} from '../routing/ors.ts';
import { createSearchRouter } from './routes/search.ts';
import type { SearchDispatcher } from '../search/dispatcher.ts';

export interface AppDeps {
  db: Database;
  ors: {
    getDrivingDistance(from: LatLng, to: LatLng): Promise<{ meters: number; seconds: number }>;
  };
  searchDispatcher?: SearchDispatcher;
  searchCacheTtlMs?: number;
  corsOrigin?: string | string[];
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

  app.get('/api/trails', (_req, res) => {
    const rows = deps.db
      .prepare<[], TrailRow>(
        'SELECT id, name, trailhead_lat, trailhead_lng, length_meters, elevation_gain_meters FROM trail ORDER BY id',
      )
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

  app.get('/api/distance', async (req: Request, res: Response, next: NextFunction) => {
    const propertyId = Number(req.query['propertyId']);
    const trailId = Number(req.query['trailId']);
    if (!Number.isInteger(propertyId) || !Number.isInteger(trailId)) {
      res.status(400).json({ error: 'propertyId and trailId must be integers' });
      return;
    }
    try {
      const result = await getCachedDrivingDistance(deps.db, propertyId, trailId, {
        client: deps.ors,
        getCoords: (pId, tId) => {
          const pRow = deps.db
            .prepare<[number], { lat: number | null; lng: number | null }>(
              'SELECT lat, lng FROM property WHERE id = ?',
            )
            .get(pId);
          const tRow = deps.db
            .prepare<[number], { trailhead_lat: number; trailhead_lng: number }>(
              'SELECT trailhead_lat, trailhead_lng FROM trail WHERE id = ?',
            )
            .get(tId);
          if (!pRow || !tRow || pRow.lat === null || pRow.lng === null) return null;
          return {
            from: { lat: pRow.lat, lng: pRow.lng },
            to: { lat: tRow.trailhead_lat, lng: tRow.trailhead_lng },
          };
        },
      });
      res.json(result);
    } catch (err) {
      if (err instanceof RateLimitedError) {
        res.status(429).json({ error: err.message });
        return;
      }
      if (err instanceof NoRoutableRouteError) {
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

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[server] unhandled error:', err);
    res.status(500).json({ error: err.message });
  });

  return app;
}
