import { describe, it, expect } from 'vitest';
import { openDb, createSource, upsertCandidate } from '../../src/db/repo.ts';

describe('migration 0007', () => {
  it('allows amap + ctrip source kinds and candidate providers', () => {
    const db = openDb(':memory:');
    expect(() => createSource(db, 'amap')).not.toThrow();
    expect(() => createSource(db, 'ctrip')).not.toThrow();
    const c = upsertCandidate(db, {
      provider: 'amap',
      externalId: 'B0FFABC123',
      name: '杭州西湖民宿',
      url: 'https://amap.com',
      lat: 30.24,
      lng: 120.15,
      priceLabel: null,
      priceAmount: null,
      currency: null,
      photoUrl: null,
      rating: null,
      reviewCount: null,
      rawJson: '{}',
    });
    expect(c.id).toBeGreaterThan(0);
    db.close();
  });

  it('creates amap_poi_cache', () => {
    const db = openDb(':memory:');
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='amap_poi_cache'")
      .get();
    expect(row).toBeTruthy();
    db.close();
  });
});
