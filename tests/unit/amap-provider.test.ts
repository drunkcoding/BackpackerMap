import { describe, it, expect } from 'vitest';
import { AmapProvider } from '../../src/search/providers/amap.ts';
import type { ProviderResult, SearchQuery } from '../../src/search/types.ts';

const query: SearchQuery = {
  bbox: { north: 30.3, south: 30.2, east: 120.2, west: 120.1 },
  zoom: 13,
  checkin: null,
  checkout: null,
  guests: { adults: 2, children: 0, infants: 0 },
  currency: 'CNY',
  maxResults: 25,
};

function fakeAmapResponse() {
  return {
    status: '1',
    pois: [
      {
        id: 'B0FFABC',
        name: '西湖民宿',
        location: '120.150000,30.250000',
        typecode: '100200',
        address: '龙井路1号',
        tel: '',
        photos: [{ url: 'http://p/1.jpg' }],
      },
    ],
  };
}

describe('AmapProvider', () => {
  it('maps POIs and converts GCJ-02 -> WGS-84', async () => {
    const provider = new AmapProvider({
      apiKey: 'K',
      fetchJson: async () => fakeAmapResponse(),
      cache: { get: () => null, put: () => {} },
    });
    const results = await provider.search(query);
    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.provider).toBe('amap');
    expect(r.externalId).toBe('B0FFABC');
    expect(r.lng).toBeCloseTo(120.14529, 4);
    expect(r.lat).toBeCloseTo(30.25232, 4);
    expect(r.photoUrl).toBe('http://p/1.jpg');
  });

  it('returns [] when the circuit breaker is open', async () => {
    let calls = 0;
    const provider = new AmapProvider({
      apiKey: 'K',
      fetchJson: async () => {
        calls++;
        return fakeAmapResponse();
      },
      cache: { get: () => null, put: () => {} },
      dailyLimit: 0,
    });
    const results = await provider.search(query);
    expect(results).toEqual([]);
    expect(calls).toBe(0);
  });

  it('serves from cache without calling the API', async () => {
    let calls = 0;
    const cached: ProviderResult[] = [
      {
        provider: 'amap',
        externalId: 'X',
        name: 'n',
        url: 'u',
        lat: 30,
        lng: 120,
        priceLabel: null,
        priceAmount: null,
        currency: null,
        photoUrl: null,
        rating: null,
        reviewCount: null,
        rawJson: '{}',
      },
    ];
    const provider = new AmapProvider({
      apiKey: 'K',
      fetchJson: async () => {
        calls++;
        return fakeAmapResponse();
      },
      cache: { get: () => cached, put: () => {} },
    });
    const results = await provider.search(query);
    expect(calls).toBe(0);
    expect(results[0]!.externalId).toBe('X');
  });
});
