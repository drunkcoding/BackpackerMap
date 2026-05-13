export interface PolygonFetcherOptions {
  fetchImpl?: typeof fetch;
  endpoint?: string;
  userAgent?: string;
  cacheSize?: number;
}

export type GeoJsonGeometry = {
  type: 'Polygon' | 'MultiPolygon' | string;
  coordinates: unknown;
};

export interface PolygonResult {
  osmType: 'N' | 'W' | 'R';
  osmId: number;
  geometry: GeoJsonGeometry | null;
}

export interface PolygonFetcher {
  fetchPolygon(osmType: 'N' | 'W' | 'R', osmId: number): Promise<PolygonResult>;
}

interface NominatimLookupItem {
  osm_type?: string;
  osm_id?: number;
  geojson?: GeoJsonGeometry;
}

class LruCache<K, V> {
  private readonly capacity: number;
  private readonly map = new Map<K, V>();
  constructor(capacity: number) {
    this.capacity = capacity;
  }
  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }
  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.capacity) {
      const firstKey = this.map.keys().next().value;
      if (firstKey === undefined) break;
      this.map.delete(firstKey);
    }
  }
}

const TYPE_TO_PREFIX: Record<'N' | 'W' | 'R', string> = {
  N: 'N',
  W: 'W',
  R: 'R',
};

export function createPolygonFetcher(options: PolygonFetcherOptions = {}): PolygonFetcher {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? 'https://nominatim.openstreetmap.org/lookup';
  const userAgent =
    options.userAgent ?? 'BackpackerMap/0.1 (https://github.com/example/backpackermap)';
  const cache = new LruCache<string, PolygonResult>(options.cacheSize ?? 256);

  return {
    async fetchPolygon(osmType, osmId) {
      const key = `${osmType}${osmId}`;
      const hit = cache.get(key);
      if (hit) return hit;

      const params = new URLSearchParams({
        osm_ids: `${TYPE_TO_PREFIX[osmType]}${osmId}`,
        format: 'json',
        polygon_geojson: '1',
      });
      const url = `${endpoint}?${params.toString()}`;
      const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent } });
      if (!res.ok) {
        throw new Error(`nominatim: HTTP ${res.status}`);
      }
      const json = (await res.json()) as NominatimLookupItem[];
      const first = Array.isArray(json) ? json[0] : null;
      const result: PolygonResult = {
        osmType,
        osmId,
        geometry: first?.geojson ?? null,
      };
      cache.set(key, result);
      return result;
    },
  };
}
