import { describe, expect, it } from 'vitest';
import { pointInGeometry, type GeoJsonGeometry } from '../pointInPolygon';

const SQUARE: GeoJsonGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ],
};

const SQUARE_WITH_HOLE: GeoJsonGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    [
      [3, 3],
      [7, 3],
      [7, 7],
      [3, 7],
      [3, 3],
    ],
  ],
};

const TWO_SQUARES: GeoJsonGeometry = {
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [0, 0],
        [5, 0],
        [5, 5],
        [0, 5],
        [0, 0],
      ],
    ],
    [
      [
        [20, 20],
        [25, 20],
        [25, 25],
        [20, 25],
        [20, 20],
      ],
    ],
  ],
};

describe('pointInGeometry', () => {
  it('detects a point clearly inside a polygon', () => {
    expect(pointInGeometry(5, 5, SQUARE)).toBe(true);
  });

  it('detects a point clearly outside a polygon', () => {
    expect(pointInGeometry(15, 15, SQUARE)).toBe(false);
    expect(pointInGeometry(-1, 5, SQUARE)).toBe(false);
  });

  it('returns false for points inside the hole of a polygon-with-hole', () => {
    expect(pointInGeometry(5, 5, SQUARE_WITH_HOLE)).toBe(false);
  });

  it('returns true for points in the polygon but outside the hole', () => {
    expect(pointInGeometry(1, 1, SQUARE_WITH_HOLE)).toBe(true);
    expect(pointInGeometry(9, 9, SQUARE_WITH_HOLE)).toBe(true);
  });

  it('handles MultiPolygon: inside the first sub-polygon', () => {
    expect(pointInGeometry(2, 2, TWO_SQUARES)).toBe(true);
  });

  it('handles MultiPolygon: inside the second sub-polygon', () => {
    expect(pointInGeometry(22, 22, TWO_SQUARES)).toBe(true);
  });

  it('handles MultiPolygon: outside both sub-polygons', () => {
    expect(pointInGeometry(10, 10, TWO_SQUARES)).toBe(false);
  });

  it('returns false for null/undefined geometry', () => {
    expect(pointInGeometry(0, 0, null)).toBe(false);
    expect(pointInGeometry(0, 0, undefined)).toBe(false);
  });

  it('returns false for unsupported geometry types', () => {
    expect(pointInGeometry(0, 0, { type: 'Point', coordinates: [0, 0] })).toBe(false);
  });
});
