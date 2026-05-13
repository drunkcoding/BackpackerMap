import { describe, expect, it, beforeEach } from 'vitest';
import type { Database } from 'better-sqlite3';
import {
  openDb,
  createSource,
  upsertTrail,
  upsertProperty,
  listTrails,
  listProperties,
  deleteProperty,
  getDistance,
  setDistance,
  type TrailInput,
  type PropertyInput,
} from '../../src/db/repo.ts';

function sampleTrail(sourceId: number, externalId = 'a.gpx'): TrailInput {
  return {
    sourceId,
    externalId,
    name: 'Test trail',
    trailheadLat: 56.7867,
    trailheadLng: -5.0035,
    lengthMeters: 8400,
    elevationGainMeters: 320,
    geojson: '{"type":"LineString","coordinates":[]}',
    rawPath: '/tmp/a.gpx',
  };
}

function sampleProperty(sourceId: number, externalId = '12345'): PropertyInput {
  return {
    sourceId,
    provider: 'airbnb',
    externalId,
    name: 'Cabin in the Cairngorms',
    url: `https://www.airbnb.com/rooms/${externalId}`,
    lat: 56.7867,
    lng: -5.0035,
    priceLabel: '£142 / night',
    photoUrl: 'https://example.com/photo.jpg',
    rawJson: '{}',
    enrichedAt: '2026-05-13T10:00:00Z',
  };
}

describe('db/repo', () => {
  let db: Database;

  beforeEach(() => {
    db = openDb(':memory:');
  });

  it('migrates cleanly on :memory:', () => {
    const tables = db
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['source', 'trail', 'property', 'distance_cache']));
  });

  it('upsertTrail is idempotent on (source_id, external_id)', () => {
    const sourceId = createSource(db, 'alltrails');
    const t1 = upsertTrail(db, sampleTrail(sourceId));
    const t2 = upsertTrail(db, { ...sampleTrail(sourceId), name: 'Updated name' });
    expect(t1.id).toBe(t2.id);
    expect(t2.name).toBe('Updated name');
    expect(listTrails(db)).toHaveLength(1);
  });

  it('upsertProperty is idempotent on (provider, external_id)', () => {
    const sourceId = createSource(db, 'airbnb');
    const p1 = upsertProperty(db, sampleProperty(sourceId));
    const p2 = upsertProperty(db, { ...sampleProperty(sourceId), name: 'Updated cabin' });
    expect(p1.id).toBe(p2.id);
    expect(p2.name).toBe('Updated cabin');
    expect(listProperties(db)).toHaveLength(1);
  });

  it('listTrails returns inserted rows', () => {
    const sourceId = createSource(db, 'alltrails');
    upsertTrail(db, sampleTrail(sourceId, 'a.gpx'));
    upsertTrail(db, sampleTrail(sourceId, 'b.gpx'));
    upsertTrail(db, { ...sampleTrail(sourceId, 'sub/c.gpx'), name: 'Nested' });
    const trails = listTrails(db);
    expect(trails).toHaveLength(3);
    expect(trails.map((t) => t.externalId).sort()).toEqual(['a.gpx', 'b.gpx', 'sub/c.gpx']);
  });

  it('setDistance + getDistance round-trip values', () => {
    const tSource = createSource(db, 'alltrails');
    const pSource = createSource(db, 'airbnb');
    const t = upsertTrail(db, sampleTrail(tSource));
    const p = upsertProperty(db, sampleProperty(pSource));

    expect(getDistance(db, p.id, t.id)).toBeNull();
    setDistance(db, p.id, t.id, 42_000, 38 * 60);
    const got = getDistance(db, p.id, t.id);
    expect(got).not.toBeNull();
    expect(got!.meters).toBe(42_000);
    expect(got!.seconds).toBe(2280);
    expect(got!.computedAt).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('FK cascade: deleting a property removes its distance_cache rows', () => {
    const tSource = createSource(db, 'alltrails');
    const pSource = createSource(db, 'airbnb');
    const t = upsertTrail(db, sampleTrail(tSource));
    const p = upsertProperty(db, sampleProperty(pSource));
    setDistance(db, p.id, t.id, 1000, 60);
    expect(getDistance(db, p.id, t.id)).not.toBeNull();

    deleteProperty(db, p.id);
    expect(getDistance(db, p.id, t.id)).toBeNull();
  });
});
