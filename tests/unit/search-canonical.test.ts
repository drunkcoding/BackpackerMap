import { describe, expect, it } from 'vitest';
import { cacheKey, canonicaliseQuery } from '../../src/search/canonical.ts';
import type { SearchQuery } from '../../src/search/types.ts';

function makeQuery(over: Partial<SearchQuery> = {}): SearchQuery {
  return {
    bbox: { north: 57.2, south: 57.0, east: -3.7, west: -3.9 },
    zoom: 11,
    checkin: '2026-07-01',
    checkout: '2026-07-07',
    guests: { adults: 2, children: 0, infants: 0 },
    priceMin: 50,
    priceMax: 300,
    currency: 'EUR',
    maxResults: 50,
    ...over,
  };
}

describe('cacheKey', () => {
  it('identical queries produce identical keys', () => {
    const q1 = makeQuery();
    const q2 = makeQuery();
    expect(cacheKey(q1, 'airbnb')).toBe(cacheKey(q2, 'airbnb'));
  });

  it('different filter array orders produce identical keys', () => {
    const a = cacheKey(makeQuery({ amenities: ['wifi', 'pool'] }), 'airbnb');
    const b = cacheKey(makeQuery({ amenities: ['pool', 'wifi'] }), 'airbnb');
    expect(a).toBe(b);
  });

  it('bbox drift within 0.0005 deg (< 110 m at equator) produces identical key', () => {
    const baseline = cacheKey(makeQuery(), 'airbnb');
    const drifted = cacheKey(
      makeQuery({ bbox: { north: 57.2002, south: 57.0001, east: -3.7001, west: -3.9001 } }),
      'airbnb',
    );
    expect(drifted).toBe(baseline);
  });

  it('cross-provider keys differ for the same query', () => {
    const q = makeQuery();
    expect(cacheKey(q, 'airbnb')).not.toBe(cacheKey(q, 'booking'));
    expect(cacheKey(q, 'airbnb')).not.toBe(cacheKey(q, 'all'));
  });

  it('different price ranges produce different keys', () => {
    expect(cacheKey(makeQuery({ priceMin: 50 }), 'airbnb')).not.toBe(
      cacheKey(makeQuery({ priceMin: 100 }), 'airbnb'),
    );
  });
});

describe('canonicaliseQuery', () => {
  it('rounds bbox to 3 decimal places', () => {
    const q = canonicaliseQuery(
      makeQuery({ bbox: { north: 57.20049, south: 57.0, east: -3.7, west: -3.9 } }),
    );
    expect(q.bbox.north).toBe(57.2);
  });

  it('sorts array filters', () => {
    const q = canonicaliseQuery(makeQuery({ amenities: ['wifi', 'pool', 'ac'] }));
    expect(q.amenities).toEqual(['ac', 'pool', 'wifi']);
  });
});
