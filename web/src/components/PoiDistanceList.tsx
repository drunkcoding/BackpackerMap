import type { ApiPoi, ApiProperty } from '../api';
import { nearestPois } from '../lib/nearestPois';
import { PoiDistanceRow } from './PoiDistanceRow';

export interface PoiDistanceListProps {
  property: ApiProperty;
  pois: ApiPoi[];
  limit?: number;
}

export function PoiDistanceList({ property, pois, limit = 10 }: PoiDistanceListProps) {
  const top = nearestPois(
    { lat: property.lat, lng: property.lng },
    pois,
    limit,
  );

  if (top.length === 0) return null;

  return (
    <>
      <p className="bpm-section-label">Nearest places</p>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {top.map((p, i) => (
          <PoiDistanceRow key={p.id} index={i + 1} poi={p} propertyId={property.id} />
        ))}
      </ol>
    </>
  );
}
