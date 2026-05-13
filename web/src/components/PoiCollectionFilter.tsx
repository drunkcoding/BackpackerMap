export interface PoiCollectionFilterProps {
  collections: string[];
  isVisible: (collection: string) => boolean;
  onToggle: (collection: string) => void;
}

export function PoiCollectionFilter({
  collections,
  isVisible,
  onToggle,
}: PoiCollectionFilterProps) {
  if (collections.length === 0) return null;
  return (
    <div className="bpm-poi-filter" role="group" aria-label="Filter places by list">
      {collections.map((name) => {
        const active = isVisible(name);
        return (
          <button
            key={name}
            type="button"
            className={`bpm-poi-chip${active ? ' is-active' : ''}`}
            aria-pressed={active}
            onClick={() => onToggle(name)}
            data-testid={`poi-collection-chip-${name}`}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}
