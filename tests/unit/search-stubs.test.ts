import { describe, expect, it } from 'vitest';
import { ApifyAirbnbProvider } from '../../src/search/providers/apify-airbnb.ts';
import { ApifyBookingProvider } from '../../src/search/providers/apify-booking.ts';
import { BookingDemandApiProvider } from '../../src/search/providers/booking-demand-api.ts';
import { ProviderNotImplementedError, type SearchQuery } from '../../src/search/types.ts';

function makeQuery(): SearchQuery {
  return {
    bbox: { north: 1, south: 0, east: 1, west: 0 },
    zoom: 10,
    checkin: null,
    checkout: null,
    guests: { adults: 1, children: 0, infants: 0 },
    currency: 'USD',
    maxResults: 10,
  };
}

describe('stub providers', () => {
  it('ApifyAirbnbProvider throws ProviderNotImplementedError with name', async () => {
    const p = new ApifyAirbnbProvider({});
    await expect(p.search(makeQuery())).rejects.toBeInstanceOf(ProviderNotImplementedError);
    expect(p.name).toBe('apify-airbnb');
    expect(p.provider).toBe('airbnb');
  });

  it('ApifyBookingProvider throws ProviderNotImplementedError with name', async () => {
    const p = new ApifyBookingProvider({});
    await expect(p.search(makeQuery())).rejects.toThrowError(/apify-booking/);
    expect(p.provider).toBe('booking');
  });

  it('BookingDemandApiProvider throws ProviderNotImplementedError with name', async () => {
    const p = new BookingDemandApiProvider({});
    await expect(p.search(makeQuery())).rejects.toThrowError(/booking-demand-api/);
    expect(p.provider).toBe('booking');
  });
});
