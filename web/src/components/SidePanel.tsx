import { useEffect, useRef, type ReactNode } from 'react';
import type { ApiPoi, ApiProperty, ApiTrail } from '../api';
import { PropertyHero } from './PropertyHero';
import { TrailDistanceList } from './TrailDistanceList';
import { PoiDistanceList } from './PoiDistanceList';

export interface SidePanelProps {
  property: ApiProperty | null;
  trails: ApiTrail[];
  pois?: ApiPoi[];
  onClose: () => void;
  onHoverTrail?: (trailId: number | null) => void;
  extraAction?: ReactNode;
}

export function SidePanel({
  property,
  trails,
  pois,
  onClose,
  onHoverTrail,
  extraAction,
}: SidePanelProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const open = property !== null;

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open, property?.id]);

  return (
    <aside
      className={`bpm-sidepanel bpm-paper-noise${open ? ' is-open' : ''}`}
      aria-hidden={!open}
      data-testid="side-panel"
    >
      <button
        ref={closeRef}
        type="button"
        className="bpm-sidepanel-close"
        onClick={onClose}
        aria-label="Close side panel"
      >
        ✕ close
      </button>
      {property && (
        <>
          <PropertyHero property={property} />
          {extraAction && <div className="bpm-extra-action">{extraAction}</div>}
          <hr className="bpm-divider" />
          <TrailDistanceList
            property={property}
            trails={trails}
            {...(onHoverTrail ? { onHover: onHoverTrail } : {})}
          />
          {pois && pois.length > 0 && (
            <>
              <hr className="bpm-divider" />
              <PoiDistanceList property={property} pois={pois} />
            </>
          )}
        </>
      )}
    </aside>
  );
}
