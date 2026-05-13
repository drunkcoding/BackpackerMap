import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS,
  filtersFingerprint,
  filtersToSearchParams,
} from '../searchQuery';

const bbox = { north: 57.2, south: 57.0, east: -3.7, west: -3.9 };

describe('filtersToSearchParams', () => {
  it('encodes bbox and defaults', () => {
    const p = filtersToSearchParams(bbox, DEFAULT_FILTERS);
    expect(p.get('north')).toBe('57.2');
    expect(p.get('south')).toBe('57');
    expect(p.get('east')).toBe('-3.7');
    expect(p.get('west')).toBe('-3.9');
    expect(p.get('adults')).toBe('2');
    expect(p.get('currency')).toBe('EUR');
    expect(p.has('children')).toBe(false);
  });

  it('encodes arrays as comma-separated', () => {
    const p = filtersToSearchParams(bbox, {
      ...DEFAULT_FILTERS,
      amenities: ['wifi', 'pool'],
      roomTypes: ['entire', 'private'],
    });
    expect(p.get('amenities')).toBe('wifi,pool');
    expect(p.get('roomTypes')).toBe('entire,private');
  });

  it('omits null and empty values', () => {
    const p = filtersToSearchParams(bbox, DEFAULT_FILTERS);
    expect(p.has('priceMin')).toBe(false);
    expect(p.has('checkin')).toBe(false);
    expect(p.has('amenities')).toBe(false);
  });
});

describe('filtersFingerprint', () => {
  it('is stable across re-ordering of array fields', () => {
    const a = filtersFingerprint({ ...DEFAULT_FILTERS, amenities: ['wifi', 'pool'] });
    const b = filtersFingerprint({ ...DEFAULT_FILTERS, amenities: ['pool', 'wifi'] });
    expect(a).toBe(b);
  });

  it('differs when a numeric filter changes', () => {
    const a = filtersFingerprint(DEFAULT_FILTERS);
    const b = filtersFingerprint({ ...DEFAULT_FILTERS, adults: 3 });
    expect(a).not.toBe(b);
  });
});
