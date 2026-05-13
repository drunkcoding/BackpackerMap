import type { FilterState } from '../lib/searchQuery';

export interface FilterBarTier1Props {
  filters: FilterState;
  setFilter: <K extends keyof FilterState>(k: K, v: FilterState[K]) => void;
}

export function FilterBarTier1({ filters, setFilter }: FilterBarTier1Props) {
  const datesInvalid =
    filters.checkin !== null &&
    filters.checkout !== null &&
    filters.checkin >= filters.checkout;

  return (
    <div className="bpm-filter-group" data-testid="filter-tier1">
      <label className="bpm-filter-label">
        Check-in
        <input
          type="date"
          value={filters.checkin ?? ''}
          onChange={(e) => setFilter('checkin', e.target.value || null)}
          data-testid="filter-checkin"
        />
      </label>
      <label className="bpm-filter-label">
        Check-out
        <input
          type="date"
          value={filters.checkout ?? ''}
          onChange={(e) => setFilter('checkout', e.target.value || null)}
          data-testid="filter-checkout"
        />
      </label>
      {datesInvalid && (
        <span className="bpm-filter-error" data-testid="filter-dates-error">
          Check-out must be after check-in
        </span>
      )}
      <label className="bpm-filter-label">
        Adults
        <input
          type="number"
          min={1}
          max={16}
          value={filters.adults}
          onChange={(e) => setFilter('adults', Math.max(1, Number(e.target.value) || 1))}
          data-testid="filter-adults"
        />
      </label>
      <label className="bpm-filter-label">
        Children
        <input
          type="number"
          min={0}
          max={10}
          value={filters.children}
          onChange={(e) => setFilter('children', Math.max(0, Number(e.target.value) || 0))}
          data-testid="filter-children"
        />
      </label>
      <label className="bpm-filter-label">
        Price min
        <input
          type="number"
          min={0}
          step={10}
          value={filters.priceMin ?? ''}
          onChange={(e) =>
            setFilter('priceMin', e.target.value ? Number(e.target.value) : null)
          }
          data-testid="filter-price-min"
        />
      </label>
      <label className="bpm-filter-label">
        Price max
        <input
          type="number"
          min={0}
          step={10}
          value={filters.priceMax ?? ''}
          onChange={(e) =>
            setFilter('priceMax', e.target.value ? Number(e.target.value) : null)
          }
          data-testid="filter-price-max"
        />
      </label>
    </div>
  );
}
