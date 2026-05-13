import { describe, expect, it } from 'vitest';
import { AMENITY_CATALOG, amenityIdsFor } from '../../src/search/amenities.ts';

describe('AMENITY_CATALOG', () => {
  it('every entry has a label and at least one provider code', () => {
    for (const [key, entry] of Object.entries(AMENITY_CATALOG)) {
      expect(entry.label).toBeTruthy();
      const hasOne = entry.airbnb !== null || entry.booking !== null;
      expect(hasOne, `entry ${key} has neither airbnb nor booking code`).toBe(true);
    }
  });

  it('contains at least 15 curated amenities', () => {
    expect(Object.keys(AMENITY_CATALOG).length).toBeGreaterThanOrEqual(15);
  });
});

describe('amenityIdsFor', () => {
  it('returns Airbnb numeric IDs', () => {
    expect(amenityIdsFor('airbnb', ['wifi', 'pool'])).toEqual([4, 7]);
  });

  it('returns Booking numeric IDs', () => {
    expect(amenityIdsFor('booking', ['wifi', 'pool'])).toEqual([107, 433]);
  });

  it('skips amenities not supported by the provider', () => {
    expect(amenityIdsFor('booking', ['workspace', 'wifi'])).toEqual([107]);
  });

  it('skips unknown amenity names', () => {
    expect(amenityIdsFor('airbnb', ['nope', 'wifi'])).toEqual([4]);
  });
});
