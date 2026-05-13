import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import {
  getCachedSearch,
  getCandidates,
  promoteCandidateToProperty,
  putCachedSearch,
  upsertCandidate,
} from '../../db/repo.ts';
import { cacheKey, canonicaliseQuery } from '../../search/canonical.ts';
import type { SearchDispatcher } from '../../search/dispatcher.ts';
import { normalizePriceToTotal } from '../../search/price.ts';
import type { ProviderResult, SearchQuery } from '../../search/types.ts';

const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

function parseQuery(req: Request): SearchQuery | { error: string } {
  const q = req.query;

  const north = Number(q['north']);
  const south = Number(q['south']);
  const east = Number(q['east']);
  const west = Number(q['west']);
  if (![north, south, east, west].every(Number.isFinite)) {
    return { error: 'bbox params (north, south, east, west) required' };
  }
  if (north <= south || east <= west) {
    return { error: 'bbox must satisfy north>south and east>west' };
  }

  const zoom = q['zoom'] ? Number(q['zoom']) : 12;
  const adults = q['adults'] ? Number(q['adults']) : 2;
  const children = q['children'] ? Number(q['children']) : 0;
  const infants = q['infants'] ? Number(q['infants']) : 0;
  const pets = q['pets'] ? Number(q['pets']) : 0;
  const currency = String(q['currency'] ?? 'EUR');
  const maxResults = q['maxResults'] ? Math.min(100, Number(q['maxResults'])) : 50;

  const mode: 'list' | 'detail' = q['mode'] === 'detail' ? 'detail' : 'list';
  const query: SearchQuery = {
    bbox: { north, south, east, west },
    zoom: Number.isFinite(zoom) ? zoom : 12,
    checkin: typeof q['checkin'] === 'string' ? q['checkin'] : null,
    checkout: typeof q['checkout'] === 'string' ? q['checkout'] : null,
    guests: { adults, children, infants, pets },
    currency,
    maxResults,
    mode,
  };
  if (q['priceMin']) query.priceMin = Number(q['priceMin']);
  if (q['priceMax']) query.priceMax = Number(q['priceMax']);
  if (q['freeCancellation']) query.freeCancellation = q['freeCancellation'] === 'true';
  if (q['minBedrooms']) query.minBedrooms = Number(q['minBedrooms']);
  if (q['minBathrooms']) query.minBathrooms = Number(q['minBathrooms']);
  if (q['minBeds']) query.minBeds = Number(q['minBeds']);
  if (q['minRating']) query.minRating = Number(q['minRating']);
  if (typeof q['roomTypes'] === 'string') {
    query.roomTypes = q['roomTypes'].split(',') as NonNullable<SearchQuery['roomTypes']>;
  }
  if (typeof q['amenities'] === 'string') {
    query.amenities = q['amenities'].split(',');
  }
  if (typeof q['mealPlans'] === 'string') {
    query.mealPlans = q['mealPlans'].split(',') as NonNullable<SearchQuery['mealPlans']>;
  }
  if (typeof q['neighbourhoods'] === 'string') {
    query.neighbourhoods = q['neighbourhoods'].split(',');
  }
  if (typeof q['hostTypes'] === 'string') {
    query.hostTypes = q['hostTypes'].split(',') as NonNullable<SearchQuery['hostTypes']>;
  }

  return query;
}

export interface SearchRouteDeps {
  db: Database;
  dispatcher: SearchDispatcher;
  cacheTtlMs?: number;
}

export function createSearchRouter(deps: SearchRouteDeps): Router {
  const router = Router();
  const cacheTtlMs = deps.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;

  router.get('/search', async (req: Request, res: Response) => {
    const parsed = parseQuery(req);
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const query = canonicaliseQuery(parsed);
    const key = cacheKey(query, 'all');

    const cached = getCachedSearch(deps.db, key, cacheTtlMs);
    if (cached) {
      const candidates = getCandidates(deps.db, cached.candidateIds);
      res.json({ cached: true, candidates, warnings: [] });
      return;
    }

    let dispatched: Awaited<ReturnType<typeof deps.dispatcher.search>>;
    try {
      dispatched = await deps.dispatcher.search(query);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const ids: number[] = [];
    for (const r of dispatched.results as ProviderResult[]) {
      const norm = normalizePriceToTotal(
        r.provider,
        { priceLabel: r.priceLabel, priceAmount: r.priceAmount, currency: r.currency },
        query.checkin,
        query.checkout,
      );
      const candidate = upsertCandidate(deps.db, {
        provider: r.provider,
        externalId: r.externalId,
        name: r.name,
        url: r.url,
        lat: r.lat,
        lng: r.lng,
        priceLabel: norm.priceLabel,
        priceAmount: norm.priceAmount,
        currency: norm.currency,
        photoUrl: r.photoUrl,
        rating: r.rating,
        reviewCount: r.reviewCount,
        rawJson: r.rawJson,
      });
      ids.push(candidate.id);
    }

    // Don't poison the cache with results from a partially-failed dispatch.
    // If ANY provider warned, skip caching so the user gets a fresh attempt
    // next time instead of being served the degraded result for 10 min.
    if (dispatched.warnings.length === 0) {
      putCachedSearch(deps.db, key, JSON.stringify(query), 'all', ids);
    } else {
      res.setHeader('X-Search-Warnings', JSON.stringify(dispatched.warnings));
    }
    const candidates = getCandidates(deps.db, ids);
    res.json({ cached: false, candidates, warnings: dispatched.warnings });
  });

  router.post('/candidates/:id/promote', (req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'invalid candidate id' });
      return;
    }
    const property = promoteCandidateToProperty(deps.db, id);
    if (!property) {
      res.status(404).json({ error: 'candidate not found' });
      return;
    }
    res.json({ property });
  });

  return router;
}
