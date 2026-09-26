import { describe, it, expect } from 'vitest';
import { openDb, getAmapPoiCache, putAmapPoiCache } from '../../src/db/repo.ts';
import type { ProviderResult } from '../../src/search/types.ts';

describe('amap_poi_cache repo', () => {
  it('round-trips results and respects TTL', () => {
    const db = openDb(':memory:');
    const results: ProviderResult[] = [
      {
        provider: 'amap',
        externalId: 'A',
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
    putAmapPoiCache(db, 'k1', results);
    expect(getAmapPoiCache(db, 'k1', 60_000)).toEqual(results);
    expect(getAmapPoiCache(db, 'k1', -1)).toBeNull();
    expect(getAmapPoiCache(db, 'missing', 60_000)).toBeNull();
    db.close();
  });
});
