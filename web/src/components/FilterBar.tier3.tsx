import type { FilterState, HostType, MealPlan } from '../lib/searchQuery';
import { AMENITY_CATALOG } from './amenityCatalogClient';

const MEAL_PLANS: Array<{ key: MealPlan; label: string }> = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'half_board', label: 'Half board' },
  { key: 'all_inclusive', label: 'All inclusive' },
];

const HOST_TYPES: Array<{ key: HostType; label: string }> = [
  { key: 'superhost', label: 'Superhost' },
  { key: 'individual', label: 'Individual' },
  { key: 'professional', label: 'Professional' },
];

export interface FilterBarTier3Props {
  filters: FilterState;
  setFilter: <K extends keyof FilterState>(k: K, v: FilterState[K]) => void;
}

export function FilterBarTier3({ filters, setFilter }: FilterBarTier3Props) {
  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
  }

  return (
    <div className="bpm-filter-group" data-testid="filter-tier3">
      <div className="bpm-filter-section">
        <span className="bpm-filter-section-label">Amenities</span>
        <div className="bpm-filter-grid">
          {Object.entries(AMENITY_CATALOG).map(([key, entry]) => (
            <label key={key} className="bpm-amenity-chip" data-testid={`amenity-${key}`}>
              <input
                type="checkbox"
                checked={filters.amenities.includes(key)}
                onChange={() => setFilter('amenities', toggle(filters.amenities, key))}
              />
              {entry.label}
            </label>
          ))}
        </div>
      </div>

      <div className="bpm-filter-section">
        <span className="bpm-filter-section-label">Meal plan</span>
        <div className="bpm-filter-pills">
          {MEAL_PLANS.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`bpm-pill${filters.mealPlans.includes(m.key) ? ' is-active' : ''}`}
              onClick={() => setFilter('mealPlans', toggle(filters.mealPlans, m.key))}
              data-testid={`pill-meal-${m.key}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bpm-filter-section">
        <span className="bpm-filter-section-label">Host type</span>
        <div className="bpm-filter-pills">
          {HOST_TYPES.map((h) => (
            <button
              key={h.key}
              type="button"
              className={`bpm-pill${filters.hostTypes.includes(h.key) ? ' is-active' : ''}`}
              onClick={() => setFilter('hostTypes', toggle(filters.hostTypes, h.key))}
              data-testid={`pill-host-${h.key}`}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      <label className="bpm-filter-label">
        Neighbourhood (free text, comma-separated)
        <input
          type="text"
          value={filters.neighbourhoods.join(', ')}
          onChange={(e) =>
            setFilter(
              'neighbourhoods',
              e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s.length > 0),
            )
          }
          data-testid="filter-neighbourhoods"
        />
      </label>
    </div>
  );
}
