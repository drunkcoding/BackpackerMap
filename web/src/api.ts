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
  distance: (propertyId: number, trailId: number, signal?: AbortSignal) =>
    getJson<ApiDistance>(`/api/distance?propertyId=${propertyId}&trailId=${trailId}`, signal ? { signal } : {}),
  search: (params: URLSearchParams, signal?: AbortSignal) =>
    getJson<ApiSearchResponse>(`/api/search?${params.toString()}`, signal ? { signal } : {}),
  promoteCandidate: (id: number) =>
    fetch(`/api/candidates/${id}/promote`, { method: 'POST' }).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { property: ApiProperty };
    }),
};
