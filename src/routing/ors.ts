import type { Database } from 'better-sqlite3';
import { getRoute, setRoute, type TargetKind } from '../db/repo.ts';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DrivingDistance {
  meters: number;
  seconds: number;
}

export class RateLimitedError extends Error {
  constructor(message = 'OpenRouteService rate limit reached (40/min, 2000/day)') {
    super(message);
    this.name = 'RateLimitedError';
  }
}

export class OrsRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = 'OrsRequestError';
  }
}

export class NoRoutableRouteError extends Error {
  constructor(public readonly detail: string) {
    super(`No routable road found: ${detail}`);
    this.name = 'NoRoutableRouteError';
  }
}

export interface OrsClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  endpoint?: string;
  maxRetries?: number;
  retryDelayMs?: (attempt: number) => number;
}

interface OrsRouteResponse {
  routes?: Array<{
    summary?: { distance?: number; duration?: number };
  }>;
}

export function createOrsClient(options: OrsClientOptions): {
  getDrivingDistance(from: LatLng, to: LatLng): Promise<DrivingDistance>;
} {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const endpoint = options.endpoint ?? 'https://api.openrouteservice.org/v2/directions/driving-car';
  const maxRetries = options.maxRetries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? ((n) => 100 * 2 ** n);

  async function call(from: LatLng, to: LatLng): Promise<DrivingDistance> {
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: options.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          coordinates: [
            [from.lng, from.lat],
            [to.lng, to.lat],
          ],
        }),
      });

      if (res.status === 429) {
        throw new RateLimitedError();
      }

      if (res.status >= 500) {
        const body = await res.text();
        lastErr = new OrsRequestError(`ORS ${res.status}`, res.status, body);
        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, retryDelayMs(attempt)));
          continue;
        }
        throw lastErr;
      }

      if (!res.ok) {
        const body = await res.text();
        if (res.status === 404) {
          let detail = body;
          try {
            const parsed = JSON.parse(body) as { error?: { message?: string } };
            if (parsed?.error?.message) detail = parsed.error.message;
          } catch {
            detail = body;
          }
          throw new NoRoutableRouteError(detail);
        }
        throw new OrsRequestError(`ORS ${res.status}`, res.status, body);
      }

      const json = (await res.json()) as OrsRouteResponse;
      const summary = json.routes?.[0]?.summary;
      if (
        !summary ||
        typeof summary.distance !== 'number' ||
        typeof summary.duration !== 'number'
      ) {
        throw new OrsRequestError(
          'ORS response missing routes[0].summary',
          res.status,
          JSON.stringify(json).slice(0, 200),
        );
      }
      return { meters: summary.distance, seconds: summary.duration };
    }
    throw lastErr ?? new OrsRequestError('ORS exhausted retries', 0, '');
  }

  return { getDrivingDistance: call };
}

export interface CachedDistanceDeps {
  client: { getDrivingDistance(from: LatLng, to: LatLng): Promise<DrivingDistance> };
  getCoords(
    propertyId: number,
    targetKind: TargetKind,
    targetId: number,
  ): { from: LatLng; to: LatLng } | null;
}

export async function getCachedDrivingDistance(
  db: Database,
  propertyId: number,
  targetKind: TargetKind,
  targetId: number,
  deps: CachedDistanceDeps,
): Promise<{ meters: number; seconds: number; cached: boolean }> {
  const existing = getRoute(db, propertyId, targetKind, targetId);
  if (existing) {
    return { meters: existing.meters, seconds: existing.seconds, cached: true };
  }
  const coords = deps.getCoords(propertyId, targetKind, targetId);
  if (!coords) {
    throw new Error(`unknown property/${targetKind} pair: ${propertyId}/${targetId}`);
  }
  const fresh = await deps.client.getDrivingDistance(coords.from, coords.to);
  setRoute(db, propertyId, targetKind, targetId, fresh.meters, fresh.seconds);
  return { meters: fresh.meters, seconds: fresh.seconds, cached: false };
}
