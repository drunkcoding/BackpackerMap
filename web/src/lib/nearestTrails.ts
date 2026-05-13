import { haversine } from './haversine';
import { DEFAULT_NEAREST_RADIUS_KM } from './nearestRadius';

export interface HasCoords {
  id: number;
  trailheadLat: number;
  trailheadLng: number;
}

export function nearestTrails<T extends HasCoords>(
  origin: { lat: number; lng: number },
  trails: T[],
  n = 10,
  maxKm: number = DEFAULT_NEAREST_RADIUS_KM,
): Array<T & { straightLineMeters: number }> {
  const maxMeters = maxKm * 1000;
  return trails
    .map((t) => ({
      ...t,
      straightLineMeters: haversine(origin.lat, origin.lng, t.trailheadLat, t.trailheadLng),
    }))
    .filter((t) => t.straightLineMeters <= maxMeters)
    .sort((a, b) => a.straightLineMeters - b.straightLineMeters)
    .slice(0, n);
}
