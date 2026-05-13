function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export interface StatusBannerProps {
  trails: number;
  properties: number;
  cached: number;
}

export function StatusBanner({ trails, properties, cached }: StatusBannerProps) {
  return (
    <span className="bpm-status-banner" data-testid="status-banner">
      {plural(trails, 'trail', 'trails')} · {plural(properties, 'property', 'properties')} ·{' '}
      {plural(cached, 'cached', 'cached')}
    </span>
  );
}
