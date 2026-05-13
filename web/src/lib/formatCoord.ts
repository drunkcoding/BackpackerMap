export function formatCoord(lat: number, lng: number): string {
  const latHemi = lat >= 0 ? 'N' : 'S';
  const lngHemi = lng >= 0 ? 'E' : 'W';
  const latStr = Math.abs(lat).toFixed(4);
  const lngStr = Math.abs(lng).toFixed(4);
  return `${latStr}\u00B0 ${latHemi} \u00B7 ${lngStr}\u00B0 ${lngHemi}`;
}
