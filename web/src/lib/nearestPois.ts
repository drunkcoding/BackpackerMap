import { haversine } from './haversine';
import { DEFAULT_NEAREST_RADIUS_KM } from './nearestRadius';

export interface HasPoiCoords {
  id: number;
  lat: number;
  lng: number;
}

export function nearestPois<T extends HasPoiCoords>(
  origin: { lat: number; lng: number },
  pois: T[],
  n = 10,
  maxKm: number = DEFAULT_NEAREST_RADIUS_KM,
): Array<T & { straightLineMeters: number }> {
  const maxMeters = maxKm * 1000;
  return pois
    .map((p) => ({
      ...p,
      straightLineMeters: haversine(origin.lat, origin.lng, p.lat, p.lng),
    }))
    .filter((p) => p.straightLineMeters <= maxMeters)
    .sort((a, b) => a.straightLineMeters - b.straightLineMeters)
    .slice(0, n);
}
