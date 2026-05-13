export type RoomType = 'entire' | 'private' | 'shared' | 'hotel';
export type MealPlan = 'breakfast' | 'half_board' | 'all_inclusive';
export type HostType = 'superhost' | 'individual' | 'professional';

export interface BBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface FilterState {
  checkin: string | null;
  checkout: string | null;
  adults: number;
  children: number;
  infants: number;
  pets: number;
  priceMin: number | null;
  priceMax: number | null;
  currency: string;
  roomTypes: RoomType[];
  freeCancellation: boolean;
  minBedrooms: number | null;
  minBathrooms: number | null;
  minBeds: number | null;
  minRating: number | null;
  amenities: string[];
  mealPlans: MealPlan[];
  neighbourhoods: string[];
  hostTypes: HostType[];
  maxResults: number;
}

export const DEFAULT_FILTERS: FilterState = {
  checkin: null,
  checkout: null,
  adults: 2,
  children: 0,
  infants: 0,
  pets: 0,
  priceMin: null,
  priceMax: null,
  currency: 'EUR',
  roomTypes: [],
  freeCancellation: false,
  minBedrooms: null,
  minBathrooms: null,
  minBeds: null,
  minRating: null,
  amenities: [],
  mealPlans: [],
  neighbourhoods: [],
  hostTypes: [],
  maxResults: 50,
};

export function filtersToSearchParams(bbox: BBox, filters: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  p.set('north', String(bbox.north));
  p.set('south', String(bbox.south));
  p.set('east', String(bbox.east));
  p.set('west', String(bbox.west));
  if (filters.checkin) p.set('checkin', filters.checkin);
  if (filters.checkout) p.set('checkout', filters.checkout);
  p.set('adults', String(filters.adults));
  if (filters.children > 0) p.set('children', String(filters.children));
  if (filters.infants > 0) p.set('infants', String(filters.infants));
  if (filters.pets > 0) p.set('pets', String(filters.pets));
  if (filters.priceMin !== null) p.set('priceMin', String(filters.priceMin));
  if (filters.priceMax !== null) p.set('priceMax', String(filters.priceMax));
  p.set('currency', filters.currency);
  if (filters.roomTypes.length > 0) p.set('roomTypes', filters.roomTypes.join(','));
  if (filters.freeCancellation) p.set('freeCancellation', 'true');
  if (filters.minBedrooms !== null) p.set('minBedrooms', String(filters.minBedrooms));
  if (filters.minBathrooms !== null) p.set('minBathrooms', String(filters.minBathrooms));
  if (filters.minBeds !== null) p.set('minBeds', String(filters.minBeds));
  if (filters.minRating !== null) p.set('minRating', String(filters.minRating));
  if (filters.amenities.length > 0) p.set('amenities', filters.amenities.join(','));
  if (filters.mealPlans.length > 0) p.set('mealPlans', filters.mealPlans.join(','));
  if (filters.neighbourhoods.length > 0) p.set('neighbourhoods', filters.neighbourhoods.join(','));
  if (filters.hostTypes.length > 0) p.set('hostTypes', filters.hostTypes.join(','));
  p.set('maxResults', String(filters.maxResults));
  return p;
}

export function filtersFingerprint(filters: FilterState): string {
  const entries = Object.entries(filters).sort(([a], [b]) => a.localeCompare(b));
  const parts = entries.map(([k, v]) => {
    if (Array.isArray(v)) return `${k}=${[...v].sort().join(',')}`;
    if (v === null) return `${k}=null`;
    return `${k}=${v}`;
  });
  return parts.join('|');
}
