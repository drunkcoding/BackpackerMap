import { useState } from 'react';
import type { FilterState } from '../lib/searchQuery';
import { FilterBarTier1 } from './FilterBar.tier1';
import { FilterBarTier2 } from './FilterBar.tier2';
import { FilterBarTier3 } from './FilterBar.tier3';

export interface FilterBarProps {
  filters: FilterState;
  setFilter: <K extends keyof FilterState>(k: K, v: FilterState[K]) => void;
}

export function FilterBar({ filters, setFilter }: FilterBarProps) {
  const [showMore, setShowMore] = useState(false);
  const [showAmenities, setShowAmenities] = useState(false);

  return (
    <div className="bpm-filter-bar" data-testid="filter-bar">
      <FilterBarTier1 filters={filters} setFilter={setFilter} />
      <button
        type="button"
        className="bpm-filter-disclosure"
        onClick={() => setShowMore((v) => !v)}
        data-testid="filter-toggle-tier2"
      >
        {showMore ? 'Less ▴' : 'More ▾'}
      </button>
      <button
        type="button"
        className="bpm-filter-disclosure"
        onClick={() => setShowAmenities((v) => !v)}
        data-testid="filter-toggle-tier3"
      >
        {showAmenities ? 'Amenities ▴' : 'Amenities ▾'}
      </button>
      {showMore && <FilterBarTier2 filters={filters} setFilter={setFilter} />}
      {showAmenities && <FilterBarTier3 filters={filters} setFilter={setFilter} />}
    </div>
  );
}
