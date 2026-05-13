import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from 'better-sqlite3';
import {
  openDb,
  upsertCandidate,
  getCandidate,
  getCandidates,
  deleteCandidate,
  getCachedSearch,
  putCachedSearch,
  pruneSearchCache,
  promoteCandidateToProperty,
  listProperties,
  type CandidateInput,
} from '../../src/db/repo.ts';

function sampleCandidate(over: Partial<CandidateInput> = {}): CandidateInput {
  return {
    provider: 'airbnb',
    externalId: '12345',
    name: 'Cairngorms Pine Cabin',
    url: 'https://www.airbnb.com/rooms/12345',
    lat: 57.2,
    lng: -3.83,
    priceLabel: '£142 / night',
    priceAmount: 142,
    currency: 'GBP',
    photoUrl: 'https://example.com/photo.jpg',
    rating: 4.8,
    reviewCount: 312,
    rawJson: '{}',
    ...over,
  };
}

describe('candidate repo', () => {
  let db: Database;

  beforeEach(() => {
    db = openDb(':memory:');
  });
  afterEach(() => db.close());

  it('upsertCandidate is idempotent on (provider, external_id)', () => {
    const a = upsertCandidate(db, sampleCandidate());
    const b = upsertCandidate(db, sampleCandidate({ name: 'Updated' }));
    expect(a.id).toBe(b.id);
    expect(b.name).toBe('Updated');
    expect(getCandidates(db, [a.id])).toHaveLength(1);
  });

  it('getCandidate returns null for unknown id', () => {
    expect(getCandidate(db, 9999)).toBeNull();
  });

  it('getCandidates fetches multiple by id list', () => {
    const a = upsertCandidate(db, sampleCandidate({ externalId: 'a' }));
    const b = upsertCandidate(db, sampleCandidate({ externalId: 'b' }));
    expect(getCandidates(db, [a.id, b.id])).toHaveLength(2);
    expect(getCandidates(db, [])).toEqual([]);
  });
});

describe('search_cache', () => {
  let db: Database;

  beforeEach(() => {
    db = openDb(':memory:');
  });
  afterEach(() => db.close());

  it('miss returns null', () => {
    expect(getCachedSearch(db, 'nope', 60_000)).toBeNull();
  });

  it('put then get round-trips candidate ids', () => {
    putCachedSearch(db, 'k1', '{}', 'airbnb', [1, 2, 3]);
    const hit = getCachedSearch(db, 'k1', 60_000);
    expect(hit).not.toBeNull();
    expect(hit!.candidateIds).toEqual([1, 2, 3]);
    expect(hit!.provider).toBe('airbnb');
  });

  it('returns null when entry exceeds maxAgeMs', () => {
    db.prepare(
      `INSERT INTO search_cache (cache_key, query_json, provider, candidate_ids, fetched_at)
       VALUES (?, ?, ?, ?, datetime('now', '-30 minutes'))`,
    ).run('old', '{}', 'airbnb', '[]');
    expect(getCachedSearch(db, 'old', 10 * 60_000)).toBeNull();
  });

  it('pruneSearchCache deletes entries older than maxAgeMs', () => {
    db.prepare(
      `INSERT INTO search_cache (cache_key, query_json, provider, candidate_ids, fetched_at)
       VALUES (?, ?, ?, ?, datetime('now', '-2 hours'))`,
    ).run('old', '{}', 'airbnb', '[]');
    putCachedSearch(db, 'fresh', '{}', 'airbnb', []);
    const removed = pruneSearchCache(db, 60 * 60_000);
    expect(removed).toBe(1);
    expect(getCachedSearch(db, 'old', 60_000)).toBeNull();
    expect(getCachedSearch(db, 'fresh', 60 * 60_000)).not.toBeNull();
  });
});

describe('promoteCandidateToProperty', () => {
  let db: Database;

  beforeEach(() => {
    db = openDb(':memory:');
  });
  afterEach(() => db.close());

  it('returns null for unknown candidate id', () => {
    expect(promoteCandidateToProperty(db, 999)).toBeNull();
  });

  it('creates a property row from a candidate', () => {
    const candidate = upsertCandidate(db, sampleCandidate());
    const property = promoteCandidateToProperty(db, candidate.id);
    expect(property).not.toBeNull();
    expect(property!.provider).toBe('airbnb');
    expect(property!.externalId).toBe('12345');
    expect(property!.lat).toBe(57.2);
    expect(listProperties(db)).toHaveLength(1);
  });

  it('promoting twice is idempotent (no duplicate property rows)', () => {
    const candidate = upsertCandidate(db, sampleCandidate());
    const first = promoteCandidateToProperty(db, candidate.id);
    const second = promoteCandidateToProperty(db, candidate.id);
    expect(first!.id).toBe(second!.id);
    expect(listProperties(db)).toHaveLength(1);
  });

  it('deleting the candidate after promote does not delete the property (SET NULL)', () => {
    const candidate = upsertCandidate(db, sampleCandidate());
    promoteCandidateToProperty(db, candidate.id);
    deleteCandidate(db, candidate.id);
    expect(listProperties(db)).toHaveLength(1);
  });
});
