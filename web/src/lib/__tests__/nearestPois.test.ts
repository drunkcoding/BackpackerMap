import { describe, expect, it } from 'vitest';
import { nearestPois } from '../nearestPois';
import { DEFAULT_NEAREST_RADIUS_KM } from '../nearestRadius';

const pois = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  lat: 56.0 + i * 0.1,
  lng: -5.0 + i * 0.1,
}));

describe('nearestPois', () => {
  it('returns top 10 ascending by straight-line distance', () => {
    const result = nearestPois({ lat: 56.0, lng: -5.0 }, pois, 10);
    expect(result).toHaveLength(10);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.straightLineMeters).toBeGreaterThanOrEqual(
        result[i - 1]!.straightLineMeters,
      );
    }
    expect(result[0]!.id).toBe(1);
  });

  it('honours n parameter', () => {
    expect(nearestPois({ lat: 56.0, lng: -5.0 }, pois, 3)).toHaveLength(3);
  });

  it('handles fewer pois than n', () => {
    expect(nearestPois({ lat: 56.0, lng: -5.0 }, pois.slice(0, 4), 10)).toHaveLength(4);
  });

  it('filters out POIs beyond the default 1000km radius', () => {
    const scotland = { lat: 56.0, lng: -5.0 };
    const mixed = [
      { id: 1, lat: 56.1, lng: -5.0 },
      { id: 2, lat: 46.5, lng: 12.0 },
      { id: 3, lat: -33.9, lng: 151.2 },
    ];
    const result = nearestPois(scotland, mixed, 10);
    expect(result.map((p) => p.id)).toEqual([1]);
  });

  it('respects a custom maxKm parameter', () => {
    const scotland = { lat: 56.0, lng: -5.0 };
    const mixed = [
      { id: 1, lat: 56.1, lng: -5.0 },
      { id: 2, lat: 46.5, lng: 12.0 },
    ];
    expect(nearestPois(scotland, mixed, 10, 50).map((p) => p.id)).toEqual([1]);
    expect(
      nearestPois(scotland, mixed, 10, 2000)
        .map((p) => p.id)
        .sort(),
    ).toEqual([1, 2]);
  });

  it('exposes DEFAULT_NEAREST_RADIUS_KM = 1000', () => {
    expect(DEFAULT_NEAREST_RADIUS_KM).toBe(1000);
  });
});
