import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from 'better-sqlite3';
import {
  openDb,
  upsertCandidate,
  getCandidate,
  getCandidates,
  getCandidateRoute,
  setCandidateRoute,
  transferCandidateRoutesToProperty,
  getRoute,
  setRoute,
  upsertTrail,
  upsertProperty,
  upsertPoi,
  createSource,
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

  it('transfers cached candidate routes into route_cache under the new property id', () => {
    const tSource = createSource(db, 'alltrails');
    const trail = upsertTrail(db, {
      sourceId: tSource,
      externalId: 't.gpx',
      name: 'T',
      trailheadLat: 57.0,
      trailheadLng: -3.7,
      lengthMeters: null,
      elevationGainMeters: null,
      geojson: '{}',
      rawPath: '/tmp/t.gpx',
    });
    const candidate = upsertCandidate(db, sampleCandidate());
    setCandidateRoute(db, candidate.id, 'trail', trail.id, 14_000, 1200, null, '[[1,2]]');

    const property = promoteCandidateToProperty(db, candidate.id);
    expect(property).not.toBeNull();

    const transferred = getRoute(db, property!.id, 'trail', trail.id);
    expect(transferred).not.toBeNull();
    expect(transferred!.meters).toBe(14_000);
    expect(transferred!.seconds).toBe(1200);
    expect(transferred!.geometry).toBe('[[1,2]]');

    expect(getCandidateRoute(db, candidate.id, 'trail', trail.id)).not.toBeNull();
  });
});

describe('candidate route cache', () => {
  let db: Database;

  beforeEach(() => {
    db = openDb(':memory:');
  });
  afterEach(() => db.close());

  it('setCandidateRoute + getCandidateRoute round-trip with viaCarpark and geometry', () => {
    const candidate = upsertCandidate(db, sampleCandidate());
    const gSource = createSource(db, 'google_maps');
    const poi = upsertPoi(db, {
      sourceId: gSource,
      collection: 'Trip',
      externalId: 'poi1',
      name: 'POI',
      lat: 56.5,
      lng: -4.5,
      category: null,
      note: null,
      url: null,
      address: null,
      raw: '{}',
    });

    expect(getCandidateRoute(db, candidate.id, 'poi', poi.id)).toBeNull();
    setCandidateRoute(
      db,
      candidate.id,
      'poi',
      poi.id,
      9_000,
      720,
      { lat: 56.49, lng: -4.51 },
      '[[1,2],[3,4]]',
    );
    const got = getCandidateRoute(db, candidate.id, 'poi', poi.id);
    expect(got).not.toBeNull();
    expect(got!.meters).toBe(9_000);
    expect(got!.viaCarparkLat).toBe(56.49);
    expect(got!.viaCarparkLng).toBe(-4.51);
    expect(got!.geometry).toBe('[[1,2],[3,4]]');
  });

  it('FK cascade: deleting a candidate removes its candidate_route_cache rows', () => {
    const tSource = createSource(db, 'alltrails');
    const trail = upsertTrail(db, {
      sourceId: tSource,
      externalId: 't2.gpx',
      name: 'T2',
      trailheadLat: 57.0,
      trailheadLng: -3.7,
      lengthMeters: null,
      elevationGainMeters: null,
      geojson: '{}',
      rawPath: '/tmp/t2.gpx',
    });
    const candidate = upsertCandidate(db, sampleCandidate());
    setCandidateRoute(db, candidate.id, 'trail', trail.id, 100, 60);
    expect(getCandidateRoute(db, candidate.id, 'trail', trail.id)).not.toBeNull();

    deleteCandidate(db, candidate.id);
    expect(getCandidateRoute(db, candidate.id, 'trail', trail.id)).toBeNull();
  });

  it('transferCandidateRoutesToProperty: OR IGNORE preserves existing property cache rows', () => {
    const tSource = createSource(db, 'alltrails');
    const pSource = createSource(db, 'airbnb');
    const trail = upsertTrail(db, {
      sourceId: tSource,
      externalId: 't3.gpx',
      name: 'T3',
      trailheadLat: 57.0,
      trailheadLng: -3.7,
      lengthMeters: null,
      elevationGainMeters: null,
      geojson: '{}',
      rawPath: '/tmp/t3.gpx',
    });
    const candidate = upsertCandidate(db, sampleCandidate({ externalId: 'cand-existing' }));
    const property = upsertProperty(db, {
      sourceId: pSource,
      provider: 'airbnb',
      externalId: 'p1',
      name: 'P',
      url: 'https://example.com',
      lat: 57.2,
      lng: -3.83,
      priceLabel: null,
      photoUrl: null,
      rawJson: '{}',
      enrichedAt: null,
    });

    setRoute(db, property.id, 'trail', trail.id, 999, 99);
    setCandidateRoute(db, candidate.id, 'trail', trail.id, 14_000, 1200);

    const transferred = transferCandidateRoutesToProperty(db, candidate.id, property.id);
    expect(transferred).toBe(0);
    expect(getRoute(db, property.id, 'trail', trail.id)!.meters).toBe(999);
  });
});
