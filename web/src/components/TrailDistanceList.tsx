import type { ApiProperty, ApiTrail } from '../api';
import { nearestTrails } from '../lib/nearestTrails';
import { TrailDistanceRow } from './TrailDistanceRow';

export interface TrailDistanceListProps {
  property: ApiProperty;
  trails: ApiTrail[];
  limit?: number;
  onHover?: (trailId: number | null, geometry: [number, number][] | null) => void;
}

export function TrailDistanceList({
  property,
  trails,
  limit = 10,
  onHover,
}: TrailDistanceListProps) {
  const top = nearestTrails({ lat: property.lat, lng: property.lng }, trails, limit);

  if (top.length === 0) {
    const message =
      trails.length === 0
        ? 'No trails ingested yet.'
        : 'No trails within 1000 km of this property.';
    return <p style={{ color: 'var(--graphite)' }}>{message}</p>;
  }

  return (
    <>
      <p className="bpm-section-label">Nearest trails</p>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {top.map((t, i) => {
          const props: React.ComponentProps<typeof TrailDistanceRow> = {
            index: i + 1,
            trail: t,
            propertyId: property.id,
            ...(onHover ? { onHover } : {}),
          };
          return <TrailDistanceRow key={t.id} {...props} />;
        })}
      </ol>
    </>
  );
}
