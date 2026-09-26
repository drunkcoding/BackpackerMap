import { describe, it, expect } from 'vitest';
import { wgs84ToGcj02, gcj02ToWgs84, inChina } from '../../src/search/coords.ts';

describe('coords', () => {
  it('wgs84ToGcj02 matches reference point (Beijing)', () => {
    const [lng, lat] = wgs84ToGcj02(116.404, 39.915);
    expect(lng).toBeCloseTo(116.41024, 4);
    expect(lat).toBeCloseTo(39.9164, 4);
  });

  it('gcj02ToWgs84 matches reference point (Beijing)', () => {
    const [lng, lat] = gcj02ToWgs84(116.404, 39.915);
    expect(lng).toBeCloseTo(116.39776, 4);
    expect(lat).toBeCloseTo(39.9136, 4);
  });

  it('round-trips within ~1e-4 inside China (non-iterative inverse residual)', () => {
    const [gl, ga] = wgs84ToGcj02(120.15, 30.28);
    const [wl, wa] = gcj02ToWgs84(gl, ga);
    expect(wl).toBeCloseTo(120.15, 4);
    expect(wa).toBeCloseTo(30.28, 4);
  });

  it('is identity outside China (e.g. Dolomites)', () => {
    expect(wgs84ToGcj02(12.3, 46.6)).toEqual([12.3, 46.6]);
    expect(gcj02ToWgs84(12.3, 46.6)).toEqual([12.3, 46.6]);
  });

  it('inChina flags mainland points but not foreign ones', () => {
    expect(inChina(116.4, 39.9)).toBe(true);
    expect(inChina(12.3, 46.6)).toBe(false);
  });
});
