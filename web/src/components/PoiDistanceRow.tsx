import type { ApiPoi } from '../api';
import { formatDistance } from '../lib/formatDistance';
import { formatDuration } from '../lib/formatDuration';
import { useDistance } from '../hooks/useDistance';

export interface PoiDistanceRowProps {
  index: number;
  poi: ApiPoi;
  propertyId: number;
  onHover?: (poi: ApiPoi | null, viaCarpark: { lat: number; lng: number } | null) => void;
}

export function PoiDistanceRow({ index, poi, propertyId, onHover }: PoiDistanceRowProps) {
  const distance = useDistance(propertyId, 'poi', poi.id);
  const viaCarpark =
    distance.status === 'success' && distance.data.viaCarpark ? distance.data.viaCarpark : null;

  return (
    <li
      className="bpm-trail-row"
      data-testid={`poi-row-${poi.id}`}
      onMouseEnter={() => onHover?.(poi, viaCarpark)}
      onMouseLeave={() => onHover?.(null, null)}
    >
      <span className="bpm-trail-index">{String(index).padStart(2, '0')}</span>
      <div>
        <p className="bpm-trail-name">{poi.name}</p>
        {(poi.note || poi.address) && <p className="bpm-trail-meta">{poi.note ?? poi.address}</p>}
      </div>
      <div
        className={
          'bpm-trail-distance' +
          (distance.status === 'loading' ? ' bpm-trail-distance-loading' : '') +
          (distance.status === 'error' ? ' bpm-trail-distance-error' : '')
        }
        data-testid={`poi-distance-${poi.id}`}
        aria-live="polite"
      >
        {distance.status === 'loading' && '· · ·'}
        {distance.status === 'error' &&
          (distance.error.message.includes('422') ? '— off-road' : '— unreachable')}
        {distance.status === 'success' && (
          <>
            {formatDistance(distance.data.meters)}
            <br />
            {formatDuration(distance.data.seconds)}
            {viaCarpark && (
              <>
                <br />
                <span className="bpm-via-carpark" data-testid={`poi-via-carpark-${poi.id}`}>
                  ↪ via carpark
                </span>
              </>
            )}
          </>
        )}
      </div>
    </li>
  );
}
