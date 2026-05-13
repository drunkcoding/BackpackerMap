import { describe, expect, it } from 'vitest';
import { buildBookingSearchUrl, nfltEncode } from '../../src/search/providers/booking-url.ts';
import type { SearchQuery } from '../../src/search/types.ts';

function makeQuery(over: Partial<SearchQuery> = {}): SearchQuery {
  return {
    bbox: { north: 57.2, south: 57.0, east: -3.7, west: -3.9 },
    zoom: 11,
    checkin: '2026-07-01',
    checkout: '2026-07-07',
    guests: { adults: 2, children: 0, infants: 0 },
    currency: 'GBP',
    maxResults: 30,
    ...over,
  };
}

describe('nfltEncode', () => {
  it('encodes classes, free cancellation, review score', () => {
    expect(
      nfltEncode({ classes: [4, 5], freeCancellation: true, reviewScore: 8.0 }),
    ).toBe('class=4;class=5;fc=1;review_score=80');
  });

  it('encodes hotel-type IDs and amenities', () => {
    expect(
      nfltEncode({ htIds: [204, 216], amenityFacilities: [107, 433] }),
    ).toBe('ht_id=204;ht_id=216;hotelfacility=107;hotelfacility=433');
  });

  it('empty filter object yields empty string', () => {
    expect(nfltEncode({})).toBe('');
  });

  it('review score 9.5 encodes as 95', () => {
    expect(nfltEncode({ reviewScore: 9.5 })).toBe('review_score=95');
  });
});

describe('buildBookingSearchUrl', () => {
  it('includes checkin, checkout, guests, currency, lat/lng/radius', () => {
    const url = new URL(buildBookingSearchUrl(makeQuery()));
    expect(url.hostname).toBe('www.booking.com');
    expect(url.pathname).toBe('/searchresults.html');
    expect(url.searchParams.get('checkin')).toBe('2026-07-01');
    expect(url.searchParams.get('checkout')).toBe('2026-07-07');
    expect(url.searchParams.get('group_adults')).toBe('2');
    expect(url.searchParams.get('selected_currency')).toBe('GBP');
    expect(url.searchParams.get('latitude')).not.toBeNull();
    expect(url.searchParams.get('longitude')).not.toBeNull();
    expect(Number(url.searchParams.get('radius'))).toBeGreaterThanOrEqual(1);
  });

  it('encodes room types into nflt ht_id', () => {
    const url = new URL(buildBookingSearchUrl(makeQuery({ roomTypes: ['hotel', 'entire'] })));
    const nflt = url.searchParams.get('nflt') ?? '';
    expect(nflt).toContain('ht_id=204');
    expect(nflt).toContain('ht_id=216');
  });

  it('encodes amenities as hotelfacility codes', () => {
    const url = new URL(buildBookingSearchUrl(makeQuery({ amenities: ['wifi', 'pool'] })));
    const nflt = url.searchParams.get('nflt') ?? '';
    expect(nflt).toContain('hotelfacility=107');
    expect(nflt).toContain('hotelfacility=433');
  });

  it('encodes minRating as review_score scaled', () => {
    const url = new URL(buildBookingSearchUrl(makeQuery({ minRating: 9.0 })));
    expect(url.searchParams.get('nflt') ?? '').toContain('review_score=90');
  });
});
