import type { FilterState, RoomType } from '../lib/searchQuery';

const ROOM_TYPES: Array<{ key: RoomType; label: string }> = [
  { key: 'entire', label: 'Entire place' },
  { key: 'private', label: 'Private room' },
  { key: 'shared', label: 'Shared' },
  { key: 'hotel', label: 'Hotel' },
];

export interface FilterBarTier2Props {
  filters: FilterState;
  setFilter: <K extends keyof FilterState>(k: K, v: FilterState[K]) => void;
}

export function FilterBarTier2({ filters, setFilter }: FilterBarTier2Props) {
  function toggleRoomType(rt: RoomType) {
    const next = filters.roomTypes.includes(rt)
      ? filters.roomTypes.filter((x) => x !== rt)
      : [...filters.roomTypes, rt];
    setFilter('roomTypes', next);
  }

  return (
    <div className="bpm-filter-group" data-testid="filter-tier2">
      <div className="bpm-filter-pills">
        {ROOM_TYPES.map((rt) => (
          <button
            type="button"
            key={rt.key}
            className={`bpm-pill${filters.roomTypes.includes(rt.key) ? ' is-active' : ''}`}
            onClick={() => toggleRoomType(rt.key)}
            data-testid={`pill-room-${rt.key}`}
          >
            {rt.label}
          </button>
        ))}
      </div>
      <label className="bpm-filter-label">
        <input
          type="checkbox"
          checked={filters.freeCancellation}
          onChange={(e) => setFilter('freeCancellation', e.target.checked)}
          data-testid="filter-free-cancellation"
        />
        Free cancellation
      </label>
      <label className="bpm-filter-label">
        Min bedrooms
        <input
          type="number"
          min={0}
          max={10}
          value={filters.minBedrooms ?? ''}
          onChange={(e) =>
            setFilter('minBedrooms', e.target.value ? Number(e.target.value) : null)
          }
          data-testid="filter-min-bedrooms"
        />
      </label>
      <label className="bpm-filter-label">
        Min rating
        <input
          type="number"
          min={0}
          max={10}
          step={0.5}
          value={filters.minRating ?? ''}
          onChange={(e) =>
            setFilter('minRating', e.target.value ? Number(e.target.value) : null)
          }
          data-testid="filter-min-rating"
        />
      </label>
    </div>
  );
}
