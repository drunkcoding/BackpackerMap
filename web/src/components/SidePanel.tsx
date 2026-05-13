import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { ApiPoi, ApiProperty, ApiTrail } from '../api';
import { PropertyHero } from './PropertyHero';
import { TrailDistanceList } from './TrailDistanceList';
import { PoiDistanceList } from './PoiDistanceList';
import { PoiCollectionFilter } from './PoiCollectionFilter';

export interface SidePanelProps {
  property: ApiProperty | null;
  trails: ApiTrail[];
  pois?: ApiPoi[];
  isCollectionVisible?: (collection: string) => boolean;
  onToggleCollection?: (collection: string) => void;
  onClose: () => void;
  onHoverTrail?: (trailId: number | null) => void;
  extraAction?: ReactNode;
}

export function SidePanel({
  property,
  trails,
  pois,
  isCollectionVisible,
  onToggleCollection,
  onClose,
  onHoverTrail,
  extraAction,
}: SidePanelProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const open = property !== null;
  const isVisible = isCollectionVisible ?? (() => false);
  const toggle = onToggleCollection ?? (() => {});

  const collections = useMemo(() => {
    if (!pois) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of pois) {
      if (!seen.has(p.collection)) {
        seen.add(p.collection);
        out.push(p.collection);
      }
    }
    return out.sort((a, b) => a.localeCompare(b));
  }, [pois]);

  const visiblePois = useMemo(
    () => (pois ?? []).filter((p) => isVisible(p.collection)),
    [pois, isVisible],
  );

  const hasAnyCollection = collections.length > 0;
  const noneSelected = collections.every((c) => !isVisible(c));

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
          {hasAnyCollection && (
            <>
              <hr className="bpm-divider" />
              <p className="bpm-section-label">Nearest places</p>
              <PoiCollectionFilter
                collections={collections}
                isVisible={isVisible}
                onToggle={toggle}
              />
              {noneSelected ? (
                <p className="bpm-empty-hint" data-testid="poi-empty-hint">
                  Select a list above to see nearby places.
                </p>
              ) : (
                <PoiDistanceList
                  property={property}
                  pois={visiblePois}
                  showHeading={false}
                />
              )}
            </>
          )}
        </>
      )}
    </aside>
  );
}
