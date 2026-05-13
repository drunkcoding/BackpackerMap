import { describe, expect, it, beforeEach } from 'vitest';
import type { Database } from 'better-sqlite3';
import {
  openDb,
  createSource,
  upsertTrail,
  upsertProperty,
  upsertPoi,
  replaceCollectionPois,
  listTrails,
  listProperties,
  listPois,
  listPoisByCollection,
  deleteProperty,
  getRoute,
  setRoute,
  type TrailInput,
  type PropertyInput,
  type PoiInput,
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

function samplePoi(sourceId: number, externalId = 'ChIJ_abc'): PoiInput {
  return {
    sourceId,
    collection: 'Scotland Trip',
    externalId,
    name: 'The Drovers Inn',
    lat: 56.271,
    lng: -4.715,
    category: 'restaurant',
    note: 'great rest stop',
    url: 'https://maps.app.goo.gl/example',
    address: 'Inverarnan, Crianlarich G83 7DX, UK',
    raw: '{}',
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
    expect(tables).toEqual(
      expect.arrayContaining(['source', 'trail', 'property', 'poi', 'route_cache']),
    );
    expect(tables).not.toContain('distance_cache');
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

  it('upsertPoi is idempotent on (source_id, external_id)', () => {
    const sourceId = createSource(db, 'google_maps');
    const p1 = upsertPoi(db, samplePoi(sourceId));
    const p2 = upsertPoi(db, { ...samplePoi(sourceId), name: 'Updated inn' });
    expect(p1.id).toBe(p2.id);
    expect(p2.name).toBe('Updated inn');
    expect(listPois(db)).toHaveLength(1);
  });

  it('listPoisByCollection filters correctly', () => {
    const sourceId = createSource(db, 'google_maps');
    upsertPoi(db, { ...samplePoi(sourceId, 'a'), collection: 'Scotland Trip' });
    upsertPoi(db, { ...samplePoi(sourceId, 'b'), collection: 'Scotland Trip' });
    upsertPoi(db, { ...samplePoi(sourceId, 'c'), collection: 'Lake District' });
    expect(listPoisByCollection(db, 'Scotland Trip')).toHaveLength(2);
    expect(listPoisByCollection(db, 'Lake District')).toHaveLength(1);
    expect(listPoisByCollection(db, 'Unknown')).toHaveLength(0);
  });

  it('setRoute + getRoute round-trip values for trail target', () => {
    const tSource = createSource(db, 'alltrails');
    const pSource = createSource(db, 'airbnb');
    const t = upsertTrail(db, sampleTrail(tSource));
    const p = upsertProperty(db, sampleProperty(pSource));

    expect(getRoute(db, p.id, 'trail', t.id)).toBeNull();
    setRoute(db, p.id, 'trail', t.id, 42_000, 38 * 60);
    const got = getRoute(db, p.id, 'trail', t.id);
    expect(got).not.toBeNull();
    expect(got!.meters).toBe(42_000);
    expect(got!.seconds).toBe(2280);
    expect(got!.targetKind).toBe('trail');
    expect(got!.computedAt).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('setRoute + getRoute round-trip values for poi target', () => {
    const gSource = createSource(db, 'google_maps');
    const pSource = createSource(db, 'airbnb');
    const poi = upsertPoi(db, samplePoi(gSource));
    const prop = upsertProperty(db, sampleProperty(pSource));

    expect(getRoute(db, prop.id, 'poi', poi.id)).toBeNull();
    setRoute(db, prop.id, 'poi', poi.id, 15_000, 22 * 60);
    const got = getRoute(db, prop.id, 'poi', poi.id);
    expect(got).not.toBeNull();
    expect(got!.meters).toBe(15_000);
    expect(got!.targetKind).toBe('poi');
  });

  it('route_cache stores trail and poi entries independently for the same property', () => {
    const tSource = createSource(db, 'alltrails');
    const gSource = createSource(db, 'google_maps');
    const pSource = createSource(db, 'airbnb');
    const t = upsertTrail(db, sampleTrail(tSource));
    const poi = upsertPoi(db, samplePoi(gSource));
    const prop = upsertProperty(db, sampleProperty(pSource));

    setRoute(db, prop.id, 'trail', t.id, 42_000, 2280);
    setRoute(db, prop.id, 'poi', poi.id, 15_000, 1320);

    expect(getRoute(db, prop.id, 'trail', t.id)!.meters).toBe(42_000);
    expect(getRoute(db, prop.id, 'poi', poi.id)!.meters).toBe(15_000);
  });

  it('replaceCollectionPois: inserts on first run, returns (inserted, updated=0, removed=0)', () => {
    const sourceId = createSource(db, 'google_maps');
    const inputs = [
      { ...samplePoi(sourceId, 'a'), name: 'A' },
      { ...samplePoi(sourceId, 'b'), name: 'B' },
    ];
    const result = replaceCollectionPois(db, sourceId, 'Scotland Trip', inputs);
    expect(result).toEqual({ inserted: 2, updated: 0, removed: 0, total: 2 });
    expect(listPois(db)).toHaveLength(2);
  });

  it('replaceCollectionPois: re-run with same inputs reports (inserted=0, updated=N, removed=0)', () => {
    const sourceId = createSource(db, 'google_maps');
    const inputs = [
      { ...samplePoi(sourceId, 'a'), name: 'A' },
      { ...samplePoi(sourceId, 'b'), name: 'B' },
    ];
    replaceCollectionPois(db, sourceId, 'Scotland Trip', inputs);
    const second = replaceCollectionPois(db, sourceId, 'Scotland Trip', inputs);
    expect(second).toEqual({ inserted: 0, updated: 2, removed: 0, total: 2 });
  });

  it('replaceCollectionPois: removing a place between runs deletes it from DB', () => {
    const sourceId = createSource(db, 'google_maps');
    const initial = [
      { ...samplePoi(sourceId, 'a'), name: 'A' },
      { ...samplePoi(sourceId, 'b'), name: 'B' },
      { ...samplePoi(sourceId, 'c'), name: 'C' },
    ];
    replaceCollectionPois(db, sourceId, 'Scotland Trip', initial);
    expect(listPois(db)).toHaveLength(3);

    const reduced = [
      { ...samplePoi(sourceId, 'a'), name: 'A' },
      { ...samplePoi(sourceId, 'c'), name: 'C' },
    ];
    const result = replaceCollectionPois(db, sourceId, 'Scotland Trip', reduced);
    expect(result).toEqual({ inserted: 0, updated: 2, removed: 1, total: 2 });
    expect(
      listPois(db)
        .map((p) => p.name)
        .sort(),
    ).toEqual(['A', 'C']);
  });

  it('replaceCollectionPois: deletes orphan route_cache rows for removed POIs', () => {
    const gSource = createSource(db, 'google_maps');
    const pSource = createSource(db, 'airbnb');
    const prop = upsertProperty(db, sampleProperty(pSource));
    replaceCollectionPois(db, gSource, 'Trip', [
      { ...samplePoi(gSource, 'a'), collection: 'Trip', name: 'A' },
      { ...samplePoi(gSource, 'b'), collection: 'Trip', name: 'B' },
    ]);
    const pois = listPois(db);
    const b = pois.find((p) => p.name === 'B')!;
    setRoute(db, prop.id, 'poi', b.id, 1234, 56);
    expect(getRoute(db, prop.id, 'poi', b.id)).not.toBeNull();

    replaceCollectionPois(db, gSource, 'Trip', [
      { ...samplePoi(gSource, 'a'), collection: 'Trip', name: 'A' },
    ]);
    expect(getRoute(db, prop.id, 'poi', b.id)).toBeNull();
  });

  it('replaceCollectionPois: does NOT touch POIs in other collections', () => {
    const sourceId = createSource(db, 'google_maps');
    replaceCollectionPois(db, sourceId, 'A', [
      { ...samplePoi(sourceId, 'a1'), collection: 'A', name: 'A-one' },
      { ...samplePoi(sourceId, 'a2'), collection: 'A', name: 'A-two' },
    ]);
    replaceCollectionPois(db, sourceId, 'B', [
      { ...samplePoi(sourceId, 'b1'), collection: 'B', name: 'B-one' },
    ]);

    replaceCollectionPois(db, sourceId, 'A', [
      { ...samplePoi(sourceId, 'a1'), collection: 'A', name: 'A-one' },
    ]);

    expect(listPoisByCollection(db, 'A').map((p) => p.name)).toEqual(['A-one']);
    expect(listPoisByCollection(db, 'B').map((p) => p.name)).toEqual(['B-one']);
  });

  it('replaceCollectionPois: rejects inputs with mismatched sourceId or collection', () => {
    const sourceId = createSource(db, 'google_maps');
    expect(() =>
      replaceCollectionPois(db, sourceId, 'A', [{ ...samplePoi(sourceId, 'x'), collection: 'B' }]),
    ).toThrow(/mismatched/);
    expect(() =>
      replaceCollectionPois(db, sourceId, 'A', [{ ...samplePoi(999, 'x'), collection: 'A' }]),
    ).toThrow(/mismatched/);
  });

  it('FK cascade: deleting a property removes both trail- and poi-keyed route_cache rows', () => {
    const tSource = createSource(db, 'alltrails');
    const gSource = createSource(db, 'google_maps');
    const pSource = createSource(db, 'airbnb');
    const t = upsertTrail(db, sampleTrail(tSource));
    const poi = upsertPoi(db, samplePoi(gSource));
    const p = upsertProperty(db, sampleProperty(pSource));
    setRoute(db, p.id, 'trail', t.id, 1000, 60);
    setRoute(db, p.id, 'poi', poi.id, 500, 30);
    expect(getRoute(db, p.id, 'trail', t.id)).not.toBeNull();
    expect(getRoute(db, p.id, 'poi', poi.id)).not.toBeNull();

    deleteProperty(db, p.id);
    expect(getRoute(db, p.id, 'trail', t.id)).toBeNull();
    expect(getRoute(db, p.id, 'poi', poi.id)).toBeNull();
  });
});
