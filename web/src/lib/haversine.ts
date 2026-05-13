const EARTH_RADIUS_METERS = 6_371_008.8;

export function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const sinHalfDLat = Math.sin(dLat / 2);
  const sinHalfDLng = Math.sin(dLng / 2);
  const a = sinHalfDLat * sinHalfDLat + Math.cos(lat1) * Math.cos(lat2) * sinHalfDLng * sinHalfDLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}
