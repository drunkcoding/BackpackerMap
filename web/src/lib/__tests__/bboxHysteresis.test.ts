import { describe, expect, it } from 'vitest';
import { hasSignificantBBoxChange } from '../bboxHysteresis';

const bbox = (n: number, s: number, e: number, w: number) => ({
  north: n,
  south: s,
  east: e,
  west: w,
});

describe('hasSignificantBBoxChange', () => {
  it('returns true on first call (previous=null)', () => {
    expect(hasSignificantBBoxChange(null, bbox(57.2, 57.0, -3.7, -3.9))).toBe(true);
  });

  it('returns false for tiny drift well below threshold', () => {
    const a = bbox(57.2, 57.0, -3.7, -3.9);
    const b = bbox(57.201, 57.001, -3.701, -3.901);
    expect(hasSignificantBBoxChange(a, b, 0.2)).toBe(false);
  });

  it('returns true after a clearly significant pan', () => {
    const a = bbox(57.2, 57.0, -3.7, -3.9);
    const b = bbox(57.3, 57.1, -3.6, -3.8);
    expect(hasSignificantBBoxChange(a, b, 0.2)).toBe(true);
  });

  it('returns true when previous bbox is degenerate (area 0)', () => {
    expect(hasSignificantBBoxChange(bbox(0, 0, 0, 0), bbox(1, 0, 1, 0))).toBe(true);
  });
});
