import type { LatLng } from './ors.ts';

export class OverpassError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = 'OverpassError';
  }
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

export interface OverpassClientOptions {
  fetchImpl?: typeof fetch;
  endpoint?: string;
  maxRetries?: number;
  retryDelayMs?: (attempt: number) => number;
  userAgent?: string;
}

export interface OverpassClient {
  findNearestCarpark(
    point: LatLng,
    radii: number[],
  ): Promise<{ point: LatLng; radiusMeters: number } | null>;
}

const RADII_DEFAULT = [1000, 2000, 4000, 8000];

export function createOverpassClient(options: OverpassClientOptions = {}): OverpassClient {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const endpoint = options.endpoint ?? 'https://overpass-api.de/api/interpreter';
  const maxRetries = options.maxRetries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? ((n) => 500 * 2 ** n);
  const userAgent = options.userAgent ?? 'BackpackerMap/0.1 (carpark-fallback)';

  async function queryRadius(point: LatLng, radius: number): Promise<LatLng | null> {
    const ql = buildQuery(point, radius);
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': userAgent,
          Accept: 'application/json',
        },
        body: `data=${encodeURIComponent(ql)}`,
      });

      if (res.status === 429 || res.status === 504 || res.status >= 500) {
        const body = await res.text();
        lastErr = new OverpassError(`Overpass ${res.status}`, res.status, body);
        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, retryDelayMs(attempt)));
          continue;
        }
        throw lastErr;
      }

      if (!res.ok) {
        const body = await res.text();
        throw new OverpassError(`Overpass ${res.status}`, res.status, body);
      }

      const json = (await res.json()) as OverpassResponse;
      return pickNearest(point, json.elements ?? []);
    }
    throw lastErr ?? new OverpassError('Overpass exhausted retries', 0, '');
  }

  return {
    async findNearestCarpark(point, radii = RADII_DEFAULT) {
      const ladder = radii.length > 0 ? radii : RADII_DEFAULT;
      for (const r of ladder) {
        const hit = await queryRadius(point, r);
        if (hit) return { point: hit, radiusMeters: r };
      }
      return null;
    },
  };
}

function buildQuery(point: LatLng, radius: number): string {
  const around = `${radius},${point.lat},${point.lng}`;
  return `[out:json][timeout:25];
(
  node["amenity"="parking"](around:${around});
  way["amenity"="parking"](around:${around});
);
out center 20;`;
}

function pickNearest(origin: LatLng, elements: OverpassElement[]): LatLng | null {
  let best: { dist: number; coord: LatLng } | null = null;
  for (const el of elements) {
    const coord = coordOf(el);
    if (!coord) continue;
    const d = haversineMeters(origin, coord);
    if (best === null || d < best.dist) best = { dist: d, coord };
  }
  return best ? best.coord : null;
}

function coordOf(el: OverpassElement): LatLng | null {
  if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
    return { lat: el.lat, lng: el.lon };
  }
  if (el.center && typeof el.center.lat === 'number' && typeof el.center.lon === 'number') {
    return { lat: el.center.lat, lng: el.center.lon };
  }
  return null;
}

function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const RADII_METERS = RADII_DEFAULT;
