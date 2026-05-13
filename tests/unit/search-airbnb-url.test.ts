import { describe, expect, it } from 'vitest';
import { buildAirbnbSearchUrl } from '../../src/search/providers/airbnb-url.ts';
import type { SearchQuery } from '../../src/search/types.ts';

function makeQuery(over: Partial<SearchQuery> = {}): SearchQuery {
  return {
    bbox: { north: 57.2, south: 57.0, east: -3.7, west: -3.9 },
    zoom: 11,
    checkin: '2026-07-01',
    checkout: '2026-07-07',
    guests: { adults: 2, children: 1, infants: 0 },
    priceMin: 50,
    priceMax: 300,
    currency: 'EUR',
    maxResults: 50,
    ...over,
  };
}

describe('buildAirbnbSearchUrl', () => {
  it('encodes bbox, dates, guests, price, currency', () => {
    const url = new URL(buildAirbnbSearchUrl(makeQuery()));
    expect(url.searchParams.get('ne_lat')).toBe('57.2');
    expect(url.searchParams.get('ne_lng')).toBe('-3.7');
    expect(url.searchParams.get('sw_lat')).toBe('57');
    expect(url.searchParams.get('sw_lng')).toBe('-3.9');
    expect(url.searchParams.get('checkin')).toBe('2026-07-01');
    expect(url.searchParams.get('checkout')).toBe('2026-07-07');
    expect(url.searchParams.get('adults')).toBe('2');
    expect(url.searchParams.get('children')).toBe('1');
    expect(url.searchParams.get('price_min')).toBe('50');
    expect(url.searchParams.get('price_max')).toBe('300');
    expect(url.searchParams.get('currency')).toBe('EUR');
  });

  it('omits null dates and zero-count guests', () => {
    const url = new URL(
      buildAirbnbSearchUrl(
        makeQuery({
          checkin: null,
          checkout: null,
          guests: { adults: 2, children: 0, infants: 0 },
        }),
      ),
    );
    expect(url.searchParams.has('checkin')).toBe(false);
    expect(url.searchParams.has('children')).toBe(false);
  });

  it('encodes room types using human-readable labels', () => {
    const url = new URL(buildAirbnbSearchUrl(makeQuery({ roomTypes: ['entire', 'private'] })));
    const rt = url.searchParams.getAll('room_types[]');
    expect(rt).toContain('Entire home/apt');
    expect(rt).toContain('Private room');
  });

  it('translates amenity names to numeric IDs', () => {
    const url = new URL(buildAirbnbSearchUrl(makeQuery({ amenities: ['wifi', 'pool'] })));
    expect(url.searchParams.getAll('amenities[]')).toEqual(['4', '7']);
  });

  it('superhost host-type sets superhost=true', () => {
    const url = new URL(buildAirbnbSearchUrl(makeQuery({ hostTypes: ['superhost'] })));
    expect(url.searchParams.get('superhost')).toBe('true');
  });

  it('flexibleCancellation maps to flexible_cancellation', () => {
    const url = new URL(buildAirbnbSearchUrl(makeQuery({ freeCancellation: true })));
    expect(url.searchParams.get('flexible_cancellation')).toBe('true');
  });
});
