import { describe, expect, it } from 'vitest';
import { nearestTrails } from '../nearestTrails';

const trails = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  trailheadLat: 56.0 + i * 0.1,
  trailheadLng: -5.0 + i * 0.1,
}));

describe('nearestTrails', () => {
  it('returns top 10 ascending by straight-line distance', () => {
    const result = nearestTrails({ lat: 56.0, lng: -5.0 }, trails, 10);
    expect(result).toHaveLength(10);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.straightLineMeters).toBeGreaterThanOrEqual(
        result[i - 1]!.straightLineMeters,
      );
    }
    expect(result[0]!.id).toBe(1);
  });

  it('honours n parameter', () => {
    expect(nearestTrails({ lat: 56.0, lng: -5.0 }, trails, 3)).toHaveLength(3);
  });

  it('handles fewer trails than n', () => {
    expect(nearestTrails({ lat: 56.0, lng: -5.0 }, trails.slice(0, 4), 10)).toHaveLength(4);
  });

  it('filters out trails beyond the default 1000 km radius', () => {
    const scotland = { lat: 56.0, lng: -5.0 };
    const mixed = [
      { id: 1, trailheadLat: 56.1, trailheadLng: -5.0 },
      { id: 2, trailheadLat: 46.5, trailheadLng: 12.0 },
      { id: 3, trailheadLat: -33.9, trailheadLng: 151.2 },
    ];
    const result = nearestTrails(scotland, mixed, 10);
    expect(result.map((t) => t.id)).toEqual([1]);
  });

  it('respects a custom maxKm parameter', () => {
    const scotland = { lat: 56.0, lng: -5.0 };
    const mixed = [
      { id: 1, trailheadLat: 56.1, trailheadLng: -5.0 },
      { id: 2, trailheadLat: 46.5, trailheadLng: 12.0 },
    ];
    expect(nearestTrails(scotland, mixed, 10, 50).map((t) => t.id)).toEqual([1]);
    expect(
      nearestTrails(scotland, mixed, 10, 2000)
        .map((t) => t.id)
        .sort(),
    ).toEqual([1, 2]);
  });
});
