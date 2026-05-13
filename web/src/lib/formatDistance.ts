export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) {
    return `${Math.round(meters)} M`;
  }
  const km = meters / 1000;
  if (km < 100) {
    return `${Math.round(km)} KM`;
  }
  return `${Math.round(km).toLocaleString('en-US')} KM`;
}
