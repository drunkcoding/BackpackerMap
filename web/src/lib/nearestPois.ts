import { haversine } from './haversine';

export interface HasPoiCoords {
  id: number;
  lat: number;
  lng: number;
}

export function nearestPois<T extends HasPoiCoords>(
  origin: { lat: number; lng: number },
  pois: T[],
  n = 10,
): Array<T & { straightLineMeters: number }> {
  return pois
    .map((p) => ({
      ...p,
      straightLineMeters: haversine(origin.lat, origin.lng, p.lat, p.lng),
    }))
    .sort((a, b) => a.straightLineMeters - b.straightLineMeters)
    .slice(0, n);
}
