export interface AmenityEntry {
  label: string;
}

export const AMENITY_CATALOG: Record<string, AmenityEntry> = {
  wifi: { label: 'Wi-Fi' },
  pool: { label: 'Pool' },
  workspace: { label: 'Dedicated workspace' },
  pets_allowed: { label: 'Pets allowed' },
  kitchen: { label: 'Kitchen' },
  free_parking: { label: 'Free parking' },
  ac: { label: 'Air conditioning' },
  heating: { label: 'Heating' },
  washer: { label: 'Washer' },
  ev_charger: { label: 'EV charger' },
  hot_tub: { label: 'Hot tub' },
  sauna: { label: 'Sauna' },
  gym: { label: 'Gym' },
  breakfast: { label: 'Breakfast included' },
  family_friendly: { label: 'Family friendly' },
  beachfront: { label: 'Beachfront' },
  fireplace: { label: 'Fireplace' },
  bbq: { label: 'BBQ' },
  bike_rental: { label: 'Bike rental' },
  smoking_allowed: { label: 'Smoking allowed' },
};
