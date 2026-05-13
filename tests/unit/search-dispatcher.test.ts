import { describe, expect, it, vi } from 'vitest';
import { createDispatcher } from '../../src/search/dispatcher.ts';
import type { ProviderResult, SearchProvider, SearchQuery } from '../../src/search/types.ts';

function makeQuery(): SearchQuery {
  return {
    bbox: { north: 57.2, south: 57.0, east: -3.7, west: -3.9 },
    zoom: 11,
    checkin: null,
    checkout: null,
    guests: { adults: 2, children: 0, infants: 0 },
    currency: 'EUR',
    maxResults: 50,
  };
}

function fakeResult(provider: 'airbnb' | 'booking', id: string): ProviderResult {
  return {
    provider,
    externalId: id,
    name: `${provider}-${id}`,
    url: `https://example.com/${id}`,
    lat: 57.1,
    lng: -3.8,
    priceLabel: null,
    priceAmount: null,
    currency: null,
    photoUrl: null,
    rating: null,
    reviewCount: null,
    rawJson: '{}',
  };
}

function fakeProvider(
  name: string,
  provider: 'airbnb' | 'booking',
  results: ProviderResult[] | Error,
): SearchProvider {
  return {
    name,
    provider,
    search: vi.fn(async () => {
      if (results instanceof Error) throw results;
      return results;
    }),
  };
}

describe('createDispatcher', () => {
  it('aggregates results from all providers', async () => {
    const dispatcher = createDispatcher([
      fakeProvider('a', 'airbnb', [fakeResult('airbnb', '1')]),
      fakeProvider('b', 'booking', [fakeResult('booking', '2')]),
    ]);
    const out = await dispatcher.search(makeQuery());
    expect(out.results).toHaveLength(2);
    expect(out.warnings).toEqual([]);
    expect(out.providersRan).toEqual(['a', 'b']);
  });

  it('one provider failing -> other still returns + warning recorded', async () => {
    const dispatcher = createDispatcher([
      fakeProvider('a', 'airbnb', new Error('boom')),
      fakeProvider('b', 'booking', [fakeResult('booking', '2')]),
    ]);
    const out = await dispatcher.search(makeQuery());
    expect(out.results).toHaveLength(1);
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0]).toEqual({ provider: 'a', message: 'boom' });
  });

  it('dedups on (provider, external_id), keeping first', async () => {
    const dispatcher = createDispatcher([
      fakeProvider('a', 'airbnb', [{ ...fakeResult('airbnb', '1'), name: 'first' }]),
      fakeProvider('b', 'airbnb', [{ ...fakeResult('airbnb', '1'), name: 'second' }]),
    ]);
    const out = await dispatcher.search(makeQuery());
    expect(out.results).toHaveLength(1);
    expect(out.results[0]!.name).toBe('first');
  });

  it('empty provider list returns empty results, no warnings', async () => {
    const dispatcher = createDispatcher([]);
    const out = await dispatcher.search(makeQuery());
    expect(out.results).toEqual([]);
    expect(out.warnings).toEqual([]);
    expect(out.providersRan).toEqual([]);
  });
});
