export interface AmenityEntry {
  airbnb: number | null;
  booking: number | null;
  label: string;
}

export const AMENITY_CATALOG: Record<string, AmenityEntry> = {
  wifi: { airbnb: 4, booking: 107, label: 'Wi-Fi' },
  pool: { airbnb: 7, booking: 433, label: 'Pool' },
  workspace: { airbnb: 47, booking: null, label: 'Dedicated workspace' },
  pets_allowed: { airbnb: 12, booking: 4, label: 'Pets allowed' },
  kitchen: { airbnb: 8, booking: 999, label: 'Kitchen' },
  free_parking: { airbnb: 9, booking: 2, label: 'Free parking' },
  ac: { airbnb: 5, booking: 17, label: 'Air conditioning' },
  heating: { airbnb: 30, booking: 49, label: 'Heating' },
  washer: { airbnb: 33, booking: null, label: 'Washer' },
  ev_charger: { airbnb: 97, booking: null, label: 'EV charger' },
  hot_tub: { airbnb: 25, booking: 252, label: 'Hot tub' },
  sauna: { airbnb: 223, booking: 188, label: 'Sauna' },
  gym: { airbnb: 15, booking: 11, label: 'Gym' },
  breakfast: { airbnb: 16, booking: 8, label: 'Breakfast included' },
  family_friendly: { airbnb: 38, booking: 31, label: 'Family friendly' },
  beachfront: { airbnb: 11, booking: 78, label: 'Beachfront' },
  fireplace: { airbnb: 27, booking: null, label: 'Fireplace' },
  bbq: { airbnb: 99, booking: 28, label: 'BBQ' },
  bike_rental: { airbnb: 134, booking: 67, label: 'Bike rental' },
  smoking_allowed: { airbnb: 49, booking: 16, label: 'Smoking allowed' },
};

export function amenityIdsFor(provider: 'airbnb' | 'booking', names: string[]): number[] {
  const out: number[] = [];
  for (const name of names) {
    const entry = AMENITY_CATALOG[name];
    if (!entry) continue;
    const code = provider === 'airbnb' ? entry.airbnb : entry.booking;
    if (code !== null) out.push(code);
  }
  return out;
}
