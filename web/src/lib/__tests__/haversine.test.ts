import { describe, expect, it } from 'vitest';
import { haversine } from '../haversine';

describe('haversine', () => {
  it('London to Paris ~344 km', () => {
    const d = haversine(51.5074, -0.1278, 48.8566, 2.3522);
    expect(d).toBeGreaterThan(343_000);
    expect(d).toBeLessThan(345_000);
  });
  it('NYC to LA ~3940 km', () => {
    const d = haversine(40.7128, -74.006, 34.0522, -118.2437);
    expect(d).toBeGreaterThan(3_930_000);
    expect(d).toBeLessThan(3_950_000);
  });
  it('same point = 0', () => {
    expect(haversine(56.7867, -5.0035, 56.7867, -5.0035)).toBeCloseTo(0);
  });
});
