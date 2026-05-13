import { describe, expect, it } from 'vitest';
import { nearestPois } from '../nearestPois';

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
});
