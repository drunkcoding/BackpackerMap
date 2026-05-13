export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 60) {
    return `${totalMin} MIN`;
  }
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins === 0 ? `${hours} H` : `${hours} H ${mins} MIN`;
}
