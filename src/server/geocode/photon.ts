export type GeocodeKind = 'city' | 'town' | 'region' | 'country';

export interface GeocodeBBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface GeocodeResult {
  id: string;
  osmType: 'N' | 'W' | 'R';
  osmId: number;
  name: string;
  label: string;
  kind: GeocodeKind;
  center: { lat: number; lng: number };
  bbox: GeocodeBBox | null;
  hasPolygon: boolean;
}

export interface PhotonClientOptions {
  fetchImpl?: typeof fetch;
  endpoint?: string;
  userAgent?: string;
}

const ACCEPTED_KINDS = new Set<GeocodeKind>(['city', 'town', 'region', 'country']);
const RELATION_OSM_TYPE = 'R';
const FALLBACK_BBOX_DEG = 0.045;
const KIND_ALIASES: Record<string, GeocodeKind> = {
  city: 'city',
  town: 'town',
  region: 'region',
  state: 'region',
  province: 'region',
  country: 'country',
};

function asKind(v: unknown): GeocodeKind | null {
  if (typeof v !== 'string') return null;
  const alias = KIND_ALIASES[v];
  if (alias) return alias;
  return ACCEPTED_KINDS.has(v as GeocodeKind) ? (v as GeocodeKind) : null;
}

function normaliseExtent(extent: unknown, center: { lat: number; lng: number }): GeocodeBBox {
  if (Array.isArray(extent) && extent.length === 4 && extent.every((n) => Number.isFinite(n))) {
    const a = Number(extent[0]);
    const b = Number(extent[1]);
    const c = Number(extent[2]);
    const d = Number(extent[3]);
    // Photon documents extent as [minLon, maxLat, maxLon, minLat] but other
    // services sometimes emit [minLon, minLat, maxLon, maxLat]. Normalise by
    // taking min/max of each axis from the four candidate coords.
    const lats = [b, d];
    const lons = [a, c];
    return {
      north: Math.max(...lats),
      south: Math.min(...lats),
      east: Math.max(...lons),
      west: Math.min(...lons),
    };
  }
  return {
    north: center.lat + FALLBACK_BBOX_DEG,
    south: center.lat - FALLBACK_BBOX_DEG,
    east: center.lng + FALLBACK_BBOX_DEG,
    west: center.lng - FALLBACK_BBOX_DEG,
  };
}

function pickKind(properties: Record<string, unknown>): GeocodeKind | null {
  const direct = asKind(properties['type']);
  if (direct) return direct;
  if (properties['osm_key'] === 'place') {
    const k = asKind(properties['osm_value']);
    if (k) return k;
  }
  return null;
}

function buildLabel(p: Record<string, unknown>, name: string): string {
  const parts: string[] = [];
  parts.push(name);
  const state = typeof p['state'] === 'string' ? p['state'] : '';
  const country = typeof p['country'] === 'string' ? p['country'] : '';
  if (state && state !== name) parts.push(state);
  if (country && country !== name) parts.push(country);
  return parts.join(', ');
}

interface PhotonFeature {
  type: 'Feature';
  geometry?: { type: string; coordinates: [number, number] };
  properties?: Record<string, unknown>;
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

export function buildPhotonUrl(
  q: string,
  endpoint = 'https://photon.komoot.io/api/',
  lang = 'en',
): string {
  const params = new URLSearchParams();
  params.set('q', q);
  params.set('limit', '8');
  params.set('lang', lang);
  params.append('osm_tag', 'place:city');
  params.append('osm_tag', 'place:town');
  params.append('osm_tag', 'place:country');
  return `${endpoint}?${params.toString()}&osm_tag=place:region&osm_tag=place:state`;
}

export interface PhotonClient {
  search(q: string): Promise<GeocodeResult[]>;
}

export function createPhotonClient(options: PhotonClientOptions = {}): PhotonClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? 'https://photon.komoot.io/api/';
  const userAgent = options.userAgent ?? 'BackpackerMap/0.1 (https://github.com/example/backpackermap)';

  return {
    async search(q: string): Promise<GeocodeResult[]> {
      const trimmed = q.trim();
      if (trimmed.length < 2) return [];
      const url = buildPhotonUrl(trimmed, endpoint);
      const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent } });
      if (!res.ok) {
        throw new Error(`photon: HTTP ${res.status}`);
      }
      const json = (await res.json()) as PhotonResponse;
      const features = Array.isArray(json.features) ? json.features : [];
      const out: GeocodeResult[] = [];
      for (const f of features) {
        const props = f.properties ?? {};
        const kind = pickKind(props);
        if (!kind) continue;
        const coords = f.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length !== 2) continue;
        const lng = Number(coords[0]);
        const lat = Number(coords[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const name = typeof props['name'] === 'string' ? props['name'] : null;
        if (!name) continue;
        const osmTypeRaw = typeof props['osm_type'] === 'string' ? props['osm_type'] : '';
        const osmType: 'N' | 'W' | 'R' =
          osmTypeRaw === 'W' ? 'W' : osmTypeRaw === 'R' ? 'R' : 'N';
        const osmId = Number(props['osm_id']);
        if (!Number.isInteger(osmId)) continue;
        const center = { lat, lng };
        const bbox = normaliseExtent(props['extent'], center);
        out.push({
          id: `${osmType}:${osmId}`,
          osmType,
          osmId,
          name,
          label: buildLabel(props, name),
          kind,
          center,
          bbox,
          hasPolygon: osmType === RELATION_OSM_TYPE,
        });
      }
      return out;
    },
  };
}
