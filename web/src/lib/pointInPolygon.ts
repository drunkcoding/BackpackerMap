export type Ring = [number, number][];
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

export type GeoJsonGeometry =
  | { type: 'Polygon'; coordinates: Polygon }
  | { type: 'MultiPolygon'; coordinates: MultiPolygon }
  | { type: string; coordinates: unknown };

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    const xi = a[0];
    const yi = a[1];
    const xj = b[0];
    const yj = b[1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPoly(lng: number, lat: number, poly: Polygon): boolean {
  if (poly.length === 0) return false;
  const outer = poly[0]!;
  if (!pointInRing(lng, lat, outer)) return false;
  for (let i = 1; i < poly.length; i++) {
    if (pointInRing(lng, lat, poly[i]!)) return false;
  }
  return true;
}

export function pointInGeometry(
  lat: number,
  lng: number,
  geometry: GeoJsonGeometry | null | undefined,
): boolean {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') {
    return pointInPoly(lng, lat, geometry.coordinates as Polygon);
  }
  if (geometry.type === 'MultiPolygon') {
    const multi = geometry.coordinates as MultiPolygon;
    for (const poly of multi) {
      if (pointInPoly(lng, lat, poly)) return true;
    }
    return false;
  }
  return false;
}
