import { describe, it, expect } from 'vitest';
import { buildAmapPolygonUrl } from '../../src/search/providers/amap-url.ts';

describe('buildAmapPolygonUrl', () => {
  it('converts a WGS-84 bbox to a GCJ-02 top-left|bottom-right polygon', () => {
    const url = new URL(
      buildAmapPolygonUrl(
        { north: 30.3, south: 30.2, east: 120.2, west: 120.1 },
        { key: 'K', types: '100100|100200', page: 1, offset: 25 },
      ),
    );
    expect(url.origin + url.pathname).toBe('https://restapi.amap.com/v3/place/polygon');
    expect(url.searchParams.get('key')).toBe('K');
    expect(url.searchParams.get('types')).toBe('100100|100200');
    expect(url.searchParams.get('offset')).toBe('25');
    expect(url.searchParams.get('page')).toBe('1');
    const poly = url.searchParams.get('polygon')!;
    const [tl, br] = poly.split('|');
    const [tlLng, tlLat] = tl!.split(',').map(Number);
    const [brLng, brLat] = br!.split(',').map(Number);
    expect(tlLng).toBeCloseTo(120.1, 2);
    expect(tlLat).toBeGreaterThan(brLat);
    expect(brLng).toBeGreaterThan(tlLng);
  });
});
