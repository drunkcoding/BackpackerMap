import type { Geocoder, NominatimResult } from '../../ingest/geocode.ts';
import { gcj02ToWgs84 } from '../coords.ts';

export interface AmapGeocoderDeps {
  apiKey: string;
  fetchJson: (url: string) => Promise<unknown>;
}

interface AmapGeocodeResponse {
  status?: string;
  geocodes?: Array<{ location?: string }>;
}

const ENDPOINT = 'https://restapi.amap.com/v3/geocode/geo';

export function createAmapGeocoder(deps: AmapGeocoderDeps): Geocoder {
  async function geocode(address: string): Promise<NominatimResult | null> {
    if (!address.trim()) return null;
    const u = new URL(ENDPOINT);
    u.searchParams.set('key', deps.apiKey);
    u.searchParams.set('address', address);
    const body = (await deps.fetchJson(u.toString())) as AmapGeocodeResponse;
    if (body.status !== '1') return null;
    const loc = body.geocodes?.[0]?.location;
    if (!loc) return null;
    const [glng, glat] = loc.split(',').map(Number);
    if (!Number.isFinite(glng) || !Number.isFinite(glat)) return null;
    const [lng, lat] = gcj02ToWgs84(glng!, glat!);
    return { lat, lng };
  }
  return { geocode };
}
