import type { ApiTrail } from '../api';
import { formatDistance } from '../lib/formatDistance';
import { formatDuration } from '../lib/formatDuration';
import { useDistance } from '../hooks/useDistance';

export interface TrailDistanceRowProps {
  index: number;
  trail: ApiTrail;
  propertyId: number;
  onHover?: (trailId: number | null) => void;
}

export function TrailDistanceRow({ index, trail, propertyId, onHover }: TrailDistanceRowProps) {
  const distance = useDistance(propertyId, trail.id);

  return (
    <li
      className="bpm-trail-row"
      onMouseEnter={() => onHover?.(trail.id)}
      onMouseLeave={() => onHover?.(null)}
      data-testid={`trail-row-${trail.id}`}
    >
      <span className="bpm-trail-index">{String(index).padStart(2, '0')}</span>
      <div>
        <p className="bpm-trail-name">{trail.name}</p>
        <p className="bpm-trail-meta">
          {trail.elevationGainMeters !== null
            ? `▲ ${Math.round(trail.elevationGainMeters)} m gain`
            : ''}
          {trail.lengthMeters !== null
            ? ` · ${(trail.lengthMeters / 1000).toFixed(1)} km`
            : ''}
        </p>
      </div>
      <div
        className={
          'bpm-trail-distance' +
          (distance.status === 'loading' ? ' bpm-trail-distance-loading' : '') +
          (distance.status === 'error' ? ' bpm-trail-distance-error' : '')
        }
        data-testid={`trail-distance-${trail.id}`}
        aria-live="polite"
      >
        {distance.status === 'loading' && '· · ·'}
        {distance.status === 'error' && (distance.error.message.includes('422') ? '— off-road' : '— unreachable')}
        {distance.status === 'success' && (
          <>
            {formatDistance(distance.data.meters)}
            <br />
            {formatDuration(distance.data.seconds)}
          </>
        )}
      </div>
    </li>
  );
}
