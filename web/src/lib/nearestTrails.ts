import { haversine } from './haversine';

export interface HasCoords {
  id: number;
  trailheadLat: number;
  trailheadLng: number;
}

export function nearestTrails<T extends HasCoords>(
  origin: { lat: number; lng: number },
  trails: T[],
  n = 10,
): Array<T & { straightLineMeters: number }> {
  return trails
    .map((t) => ({
      ...t,
      straightLineMeters: haversine(origin.lat, origin.lng, t.trailheadLat, t.trailheadLng),
    }))
    .sort((a, b) => a.straightLineMeters - b.straightLineMeters)
    .slice(0, n);
}
