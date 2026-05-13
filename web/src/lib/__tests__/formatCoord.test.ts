import { describe, expect, it } from 'vitest';
import { formatCoord } from '../formatCoord';

describe('formatCoord', () => {
  it('NE quadrant', () => {
    expect(formatCoord(56.7867, 5.0035)).toBe('56.7867\u00B0 N \u00B7 5.0035\u00B0 E');
  });
  it('NW quadrant', () => {
    expect(formatCoord(56.7867, -5.0035)).toBe('56.7867\u00B0 N \u00B7 5.0035\u00B0 W');
  });
  it('SE quadrant', () => {
    expect(formatCoord(-33.86, 151.2093)).toBe('33.8600\u00B0 S \u00B7 151.2093\u00B0 E');
  });
  it('SW quadrant', () => {
    expect(formatCoord(-22.9519, -43.2105)).toBe('22.9519\u00B0 S \u00B7 43.2105\u00B0 W');
  });
  it('equator and prime meridian (0 treated as N/E)', () => {
    expect(formatCoord(0, 0)).toBe('0.0000\u00B0 N \u00B7 0.0000\u00B0 E');
  });
  it('antimeridian', () => {
    expect(formatCoord(0, 180)).toBe('0.0000\u00B0 N \u00B7 180.0000\u00B0 E');
  });
  it('north pole', () => {
    expect(formatCoord(90, 0)).toBe('90.0000\u00B0 N \u00B7 0.0000\u00B0 E');
  });
  it('south pole', () => {
    expect(formatCoord(-90, 0)).toBe('90.0000\u00B0 S \u00B7 0.0000\u00B0 E');
  });
});
