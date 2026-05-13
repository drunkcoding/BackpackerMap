export interface ApiProperty {
  id: number;
  provider: 'airbnb' | 'booking';
  externalId: string;
  name: string;
  url: string;
  lat: number;
  lng: number;
  priceLabel: string | null;
  photoUrl: string | null;
}

export interface ApiTrail {
  id: number;
  name: string;
  trailheadLat: number;
  trailheadLng: number;
  lengthMeters: number | null;
  elevationGainMeters: number | null;
}

export interface GeoLineString {
  type: 'LineString';
  coordinates: number[][];
}

export interface ApiTrailDetail extends ApiTrail {
  externalId: string | null;
  geojson: GeoLineString;
}

export interface ApiDistance {
  meters: number;
  seconds: number;
  cached: boolean;
}

export type ApiTargetKind = 'trail' | 'poi';

export interface ApiPoi {
  id: number;
  collection: string;
  externalId: string;
  name: string;
  lat: number;
  lng: number;
  category: string | null;
  note: string | null;
  url: string | null;
  address: string | null;
}

export interface ApiCandidate {
  id: number;
  provider: 'airbnb' | 'booking';
  externalId: string;
  name: string;
  url: string;
  lat: number;
  lng: number;
  priceLabel: string | null;
  priceAmount: number | null;
  currency: string | null;
  photoUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
}

export interface ApiSearchResponse {
  cached: boolean;
  candidates: ApiCandidate[];
  warnings: Array<{ provider: string; message: string }>;
}

export type GeocodeKind = 'city' | 'town' | 'region' | 'country';

export interface ApiGeocodeResult {
  id: string;
  osmType: 'N' | 'W' | 'R';
  osmId: number;
  name: string;
  label: string;
  kind: GeocodeKind;
  center: { lat: number; lng: number };
  bbox: { north: number; south: number; east: number; west: number } | null;
  hasPolygon: boolean;
}

export interface ApiGeocodePolygon {
  osmType: 'N' | 'W' | 'R';
  osmId: number;
  geometry: {
    type: 'Polygon' | 'MultiPolygon' | string;
    coordinates: unknown;
  };
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body || res.statusText}`);
  }
  return (await res.json()) as T;
}

export const api = {
  properties: () => getJson<ApiProperty[]>('/api/properties'),
  trails: () => getJson<ApiTrail[]>('/api/trails'),
  trail: (id: number) => getJson<ApiTrailDetail>(`/api/trails/${id}`),
  pois: () => getJson<ApiPoi[]>('/api/pois'),
  distance: (
    propertyId: number,
    targetKind: ApiTargetKind,
    targetId: number,
    signal?: AbortSignal,
  ) =>
    getJson<ApiDistance>(
      `/api/distance?propertyId=${propertyId}&targetKind=${targetKind}&targetId=${targetId}`,
      signal ? { signal } : {},
    ),
  search: (params: URLSearchParams, signal?: AbortSignal) =>
    getJson<ApiSearchResponse>(`/api/search?${params.toString()}`, signal ? { signal } : {}),
  promoteCandidate: (id: number) =>
    fetch(`/api/candidates/${id}/promote`, { method: 'POST' }).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { property: ApiProperty };
    }),
  geocode: (q: string, signal?: AbortSignal) =>
    getJson<{ results: ApiGeocodeResult[] }>(
      `/api/geocode?q=${encodeURIComponent(q)}`,
      signal ? { signal } : {},
    ),
  geocodePolygon: (osmType: 'N' | 'W' | 'R', osmId: number, signal?: AbortSignal) =>
    getJson<ApiGeocodePolygon>(
      `/api/geocode/polygon?osm_type=${osmType}&osm_id=${osmId}`,
      signal ? { signal } : {},
    ),
};
