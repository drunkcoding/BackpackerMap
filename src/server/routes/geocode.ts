import { Router, type Request, type Response } from 'express';
import type { PhotonClient } from '../geocode/photon.ts';
import type { PolygonFetcher } from '../geocode/polygon.ts';

export interface GeocodeRouteDeps {
  photon: PhotonClient;
  polygon: PolygonFetcher;
}

export function createGeocodeRouter(deps: GeocodeRouteDeps): Router {
  const router = Router();

  router.get('/geocode', async (req: Request, res: Response) => {
    const q = String(req.query['q'] ?? '').trim();
    if (q.length < 2) {
      res.json({ results: [] });
      return;
    }
    try {
      const results = await deps.photon.search(q);
      res.json({ results });
    } catch (err) {
      res.status(502).json({
        error: 'geocode upstream failure',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  router.get('/geocode/polygon', async (req: Request, res: Response) => {
    const osmType = String(req.query['osm_type'] ?? '');
    const osmId = Number(req.query['osm_id']);
    if (osmType !== 'N' && osmType !== 'W' && osmType !== 'R') {
      res.status(400).json({ error: "osm_type must be 'N', 'W', or 'R'" });
      return;
    }
    if (!Number.isInteger(osmId) || osmId <= 0) {
      res.status(400).json({ error: 'osm_id must be a positive integer' });
      return;
    }
    try {
      const result = await deps.polygon.fetchPolygon(osmType, osmId);
      if (!result.geometry) {
        res.status(404).json({ error: 'no polygon available for this OSM id' });
        return;
      }
      res.json({ osmType: result.osmType, osmId: result.osmId, geometry: result.geometry });
    } catch (err) {
      res.status(502).json({
        error: 'polygon upstream failure',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}
