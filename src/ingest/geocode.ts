export interface NominatimResult {
  lat: number;
  lng: number;
}

export interface GeocoderDeps {
  fetchImpl?: typeof fetch;
  endpoint?: string;
  userAgent?: string;
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

interface NominatimRow {
  lat?: string;
  lon?: string;
}

const DEFAULT_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const DEFAULT_USER_AGENT = 'BackpackerMap/0.1 (personal-use; self-hosted)';
const NOMINATIM_POLICY_INTERVAL_MS = 1100;

export function createNominatimGeocoder(deps: GeocoderDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const endpoint = deps.endpoint ?? DEFAULT_ENDPOINT;
  const userAgent = deps.userAgent ?? DEFAULT_USER_AGENT;
  const minInterval = deps.minIntervalMs ?? NOMINATIM_POLICY_INTERVAL_MS;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let lastCallAt = 0;

  async function geocode(address: string): Promise<NominatimResult | null> {
    if (!address.trim()) return null;
    const wait = lastCallAt + minInterval - now();
    if (wait > 0) await sleep(wait);
    lastCallAt = now();

    const url = `${endpoint}?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as NominatimRow[];
    const first = Array.isArray(body) ? body[0] : null;
    if (!first || !first.lat || !first.lon) return null;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  return { geocode };
}

export type Geocoder = ReturnType<typeof createNominatimGeocoder>;
