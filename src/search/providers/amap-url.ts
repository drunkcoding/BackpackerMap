import { wgs84ToGcj02 } from '../coords.ts';
import type { BBox } from '../types.ts';

export interface AmapPolygonParams {
  key: string;
  types: string;
  page: number;
  offset: number;
}

const ENDPOINT = 'https://restapi.amap.com/v3/place/polygon';

export function buildAmapPolygonUrl(bbox: BBox, params: AmapPolygonParams): string {
  // Amap wants GCJ-02; a rectangle is passed as top-left (west,north) | bottom-right (east,south).
  const [tlLng, tlLat] = wgs84ToGcj02(bbox.west, bbox.north);
  const [brLng, brLat] = wgs84ToGcj02(bbox.east, bbox.south);
  const polygon = `${tlLng.toFixed(6)},${tlLat.toFixed(6)}|${brLng.toFixed(6)},${brLat.toFixed(6)}`;
  const u = new URL(ENDPOINT);
  u.searchParams.set('key', params.key);
  u.searchParams.set('polygon', polygon);
  u.searchParams.set('types', params.types);
  u.searchParams.set('offset', String(params.offset));
  u.searchParams.set('page', String(params.page));
  u.searchParams.set('extensions', 'base');
  return u.toString();
}
