import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { migrate } from './schema.ts';

export type SourceKind = 'alltrails' | 'airbnb' | 'booking' | 'google_maps';
export type Provider = 'airbnb' | 'booking';
export type TargetKind = 'trail' | 'poi';

export interface TrailInput {
  sourceId: number;
  externalId: string;
  name: string;
  trailheadLat: number;
  trailheadLng: number;
  lengthMeters: number | null;
  elevationGainMeters: number | null;
  geojson: string;
  rawPath: string;
}

export interface Trail extends TrailInput {
  id: number;
}

export interface PropertyInput {
  sourceId: number;
  provider: Provider;
  externalId: string;
  name: string;
  url: string;
  lat: number | null;
  lng: number | null;
  priceLabel: string | null;
  photoUrl: string | null;
  rawJson: string;
  enrichedAt: string | null;
}

export interface Property extends PropertyInput {
  id: number;
}

export interface RouteEntry {
  propertyId: number;
  targetKind: TargetKind;
  targetId: number;
  meters: number;
  seconds: number;
  computedAt: string;
}

export function openDb(path: string): DatabaseType {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export function createSource(db: DatabaseType, kind: SourceKind): number {
  const info = db.prepare('INSERT INTO source (kind) VALUES (?)').run(kind);
  return Number(info.lastInsertRowid);
}

export function getOrCreateSource(db: DatabaseType, kind: SourceKind): number {
  const existing = db
    .prepare<[SourceKind], { id: number }>('SELECT id FROM source WHERE kind = ? ORDER BY id LIMIT 1')
    .get(kind);
  if (existing) return existing.id;
  return createSource(db, kind);
}

interface TrailRow {
  id: number;
  source_id: number;
  external_id: string;
  name: string;
  trailhead_lat: number;
  trailhead_lng: number;
  length_meters: number | null;
  elevation_gain_meters: number | null;
  geojson: string;
  raw_path: string;
}

function mapTrail(r: TrailRow): Trail {
  return {
    id: r.id,
    sourceId: r.source_id,
    externalId: r.external_id,
    name: r.name,
    trailheadLat: r.trailhead_lat,
    trailheadLng: r.trailhead_lng,
    lengthMeters: r.length_meters,
    elevationGainMeters: r.elevation_gain_meters,
    geojson: r.geojson,
    rawPath: r.raw_path,
  };
}

export function upsertTrail(db: DatabaseType, t: TrailInput): Trail {
  const stmt = db.prepare(`
    INSERT INTO trail
      (source_id, external_id, name, trailhead_lat, trailhead_lng,
       length_meters, elevation_gain_meters, geojson, raw_path)
    VALUES
      (@sourceId, @externalId, @name, @trailheadLat, @trailheadLng,
       @lengthMeters, @elevationGainMeters, @geojson, @rawPath)
    ON CONFLICT (source_id, external_id) DO UPDATE SET
      name = excluded.name,
      trailhead_lat = excluded.trailhead_lat,
      trailhead_lng = excluded.trailhead_lng,
      length_meters = excluded.length_meters,
      elevation_gain_meters = excluded.elevation_gain_meters,
      geojson = excluded.geojson,
      raw_path = excluded.raw_path
    RETURNING *
  `);
  const row = stmt.get(t) as TrailRow;
  return mapTrail(row);
}

export function listTrails(db: DatabaseType): Trail[] {
  return (
    db.prepare<[], TrailRow>('SELECT * FROM trail ORDER BY id').all() as TrailRow[]
  ).map(mapTrail);
}

interface PropertyRow {
  id: number;
  source_id: number;
  provider: Provider;
  external_id: string;
  name: string;
  url: string;
  lat: number | null;
  lng: number | null;
  price_label: string | null;
  photo_url: string | null;
  raw_json: string;
  enriched_at: string | null;
}

function mapProperty(r: PropertyRow): Property {
  return {
    id: r.id,
    sourceId: r.source_id,
    provider: r.provider,
    externalId: r.external_id,
    name: r.name,
    url: r.url,
    lat: r.lat,
    lng: r.lng,
    priceLabel: r.price_label,
    photoUrl: r.photo_url,
    rawJson: r.raw_json,
    enrichedAt: r.enriched_at,
  };
}

export function upsertProperty(db: DatabaseType, p: PropertyInput): Property {
  const stmt = db.prepare(`
    INSERT INTO property
      (source_id, provider, external_id, name, url, lat, lng,
       price_label, photo_url, raw_json, enriched_at)
    VALUES
      (@sourceId, @provider, @externalId, @name, @url, @lat, @lng,
       @priceLabel, @photoUrl, @rawJson, @enrichedAt)
    ON CONFLICT (provider, external_id) DO UPDATE SET
      source_id = excluded.source_id,
      name = excluded.name,
      url = excluded.url,
      lat = excluded.lat,
      lng = excluded.lng,
      price_label = excluded.price_label,
      photo_url = excluded.photo_url,
      raw_json = excluded.raw_json,
      enriched_at = excluded.enriched_at
    RETURNING *
  `);
  const row = stmt.get(p) as PropertyRow;
  return mapProperty(row);
}

export function listProperties(db: DatabaseType): Property[] {
  return (
    db.prepare<[], PropertyRow>('SELECT * FROM property ORDER BY id').all() as PropertyRow[]
  ).map(mapProperty);
}

export function deleteProperty(db: DatabaseType, id: number): void {
  db.prepare('DELETE FROM property WHERE id = ?').run(id);
}

interface RouteRow {
  property_id: number;
  target_kind: TargetKind;
  target_id: number;
  meters: number;
  seconds: number;
  computed_at: string;
}

export function getRoute(
  db: DatabaseType,
  propertyId: number,
  targetKind: TargetKind,
  targetId: number,
): RouteEntry | null {
  const row = db
    .prepare<[number, TargetKind, number], RouteRow>(
      'SELECT * FROM route_cache WHERE property_id = ? AND target_kind = ? AND target_id = ?',
    )
    .get(propertyId, targetKind, targetId);
  if (!row) return null;
  return {
    propertyId: row.property_id,
    targetKind: row.target_kind,
    targetId: row.target_id,
    meters: row.meters,
    seconds: row.seconds,
    computedAt: row.computed_at,
  };
}

export function setRoute(
  db: DatabaseType,
  propertyId: number,
  targetKind: TargetKind,
  targetId: number,
  meters: number,
  seconds: number,
): void {
  db.prepare(
    `INSERT INTO route_cache (property_id, target_kind, target_id, meters, seconds)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (property_id, target_kind, target_id) DO UPDATE SET
       meters = excluded.meters,
       seconds = excluded.seconds,
       computed_at = datetime('now')`,
  ).run(propertyId, targetKind, targetId, meters, seconds);
}

export interface PoiInput {
  sourceId: number;
  collection: string;
  externalId: string;
  name: string;
  lat: number;
  lng: number;
  category: string | null;
  note: string | null;
  url: string | null;
  address: string | null;
  raw: string;
}

export interface Poi extends PoiInput {
  id: number;
  ingestedAt: string;
}

interface PoiRow {
  id: number;
  source_id: number;
  collection: string;
  external_id: string;
  name: string;
  lat: number;
  lng: number;
  category: string | null;
  note: string | null;
  url: string | null;
  address: string | null;
  raw: string;
  ingested_at: string;
}

function mapPoi(r: PoiRow): Poi {
  return {
    id: r.id,
    sourceId: r.source_id,
    collection: r.collection,
    externalId: r.external_id,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    category: r.category,
    note: r.note,
    url: r.url,
    address: r.address,
    raw: r.raw,
    ingestedAt: r.ingested_at,
  };
}

export function upsertPoi(db: DatabaseType, p: PoiInput): Poi {
  const stmt = db.prepare(`
    INSERT INTO poi
      (source_id, collection, external_id, name, lat, lng,
       category, note, url, address, raw)
    VALUES
      (@sourceId, @collection, @externalId, @name, @lat, @lng,
       @category, @note, @url, @address, @raw)
    ON CONFLICT (source_id, external_id) DO UPDATE SET
      collection = excluded.collection,
      name = excluded.name,
      lat = excluded.lat,
      lng = excluded.lng,
      category = excluded.category,
      note = excluded.note,
      url = excluded.url,
      address = excluded.address,
      raw = excluded.raw
    RETURNING *
  `);
  const row = stmt.get(p) as PoiRow;
  return mapPoi(row);
}

export function listPois(db: DatabaseType): Poi[] {
  return (
    db.prepare<[], PoiRow>('SELECT * FROM poi ORDER BY id').all() as PoiRow[]
  ).map(mapPoi);
}

export function listPoisByCollection(db: DatabaseType, collection: string): Poi[] {
  return (
    db
      .prepare<[string], PoiRow>('SELECT * FROM poi WHERE collection = ? ORDER BY id')
      .all(collection) as PoiRow[]
  ).map(mapPoi);
}

export interface ReplaceCollectionResult {
  inserted: number;
  updated: number;
  removed: number;
  total: number;
}

export function replaceCollectionPois(
  db: DatabaseType,
  sourceId: number,
  collection: string,
  inputs: PoiInput[],
): ReplaceCollectionResult {
  const txn = db.transaction((): ReplaceCollectionResult => {
    const beforeIds = new Set(
      db
        .prepare<[number, string], { external_id: string }>(
          'SELECT external_id FROM poi WHERE source_id = ? AND collection = ?',
        )
        .all(sourceId, collection)
        .map((r) => r.external_id),
    );

    const scrapedIds = new Set<string>();
    let inserted = 0;
    let updated = 0;
    for (const input of inputs) {
      if (input.sourceId !== sourceId || input.collection !== collection) {
        throw new Error(
          `replaceCollectionPois: input has mismatched sourceId/collection ` +
            `(want ${sourceId}/${collection}, got ${input.sourceId}/${input.collection})`,
        );
      }
      scrapedIds.add(input.externalId);
      upsertPoi(db, input);
      if (beforeIds.has(input.externalId)) updated++;
      else inserted++;
    }

    const toRemoveIds = [...beforeIds].filter((id) => !scrapedIds.has(id));
    let removed = 0;
    if (toRemoveIds.length > 0) {
      const params: Array<number | string> = [sourceId, collection, ...toRemoveIds];
      const poiIdsToRemove = (
        db
          .prepare<Array<number | string>, { id: number }>(
            `SELECT id FROM poi WHERE source_id = ? AND collection = ?
             AND external_id IN (${toRemoveIds.map(() => '?').join(',')})`,
          )
          .all(...params) as Array<{ id: number }>
      ).map((r) => r.id);

      if (poiIdsToRemove.length > 0) {
        const placeholders = poiIdsToRemove.map(() => '?').join(',');
        db.prepare(
          `DELETE FROM route_cache WHERE target_kind = 'poi' AND target_id IN (${placeholders})`,
        ).run(...poiIdsToRemove);
        const info = db
          .prepare(`DELETE FROM poi WHERE id IN (${placeholders})`)
          .run(...poiIdsToRemove);
        removed = Number(info.changes);
      }
    }

    return { inserted, updated, removed, total: inputs.length };
  });

  return txn();
}

export interface CandidateInput {
  provider: Provider;
  externalId: string;
  name: string;
  url: string;
  lat: number;
  lng: number;
  priceLabel: string | null;
  priceAmount: number | null;
  currency: string | null;
  photoUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
  rawJson: string;
}

export interface Candidate extends CandidateInput {
  id: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

interface CandidateRow {
  id: number;
  provider: Provider;
  external_id: string;
  name: string;
  url: string;
  lat: number;
  lng: number;
  price_label: string | null;
  price_amount: number | null;
  currency: string | null;
  photo_url: string | null;
  rating: number | null;
  review_count: number | null;
  raw_json: string;
  first_seen_at: string;
  last_seen_at: string;
}

function mapCandidate(r: CandidateRow): Candidate {
  return {
    id: r.id,
    provider: r.provider,
    externalId: r.external_id,
    name: r.name,
    url: r.url,
    lat: r.lat,
    lng: r.lng,
    priceLabel: r.price_label,
    priceAmount: r.price_amount,
    currency: r.currency,
    photoUrl: r.photo_url,
    rating: r.rating,
    reviewCount: r.review_count,
    rawJson: r.raw_json,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
  };
}

export function upsertCandidate(db: DatabaseType, c: CandidateInput): Candidate {
  const stmt = db.prepare(`
    INSERT INTO candidate
      (provider, external_id, name, url, lat, lng, price_label, price_amount, currency,
       photo_url, rating, review_count, raw_json)
    VALUES
      (@provider, @externalId, @name, @url, @lat, @lng, @priceLabel, @priceAmount, @currency,
       @photoUrl, @rating, @reviewCount, @rawJson)
    ON CONFLICT (provider, external_id) DO UPDATE SET
      name = excluded.name,
      url = excluded.url,
      lat = excluded.lat,
      lng = excluded.lng,
      price_label = excluded.price_label,
      price_amount = excluded.price_amount,
      currency = excluded.currency,
      photo_url = excluded.photo_url,
      rating = excluded.rating,
      review_count = excluded.review_count,
      raw_json = excluded.raw_json,
      last_seen_at = datetime('now')
    RETURNING *
  `);
  const row = stmt.get(c) as CandidateRow;
  return mapCandidate(row);
}

export function getCandidate(db: DatabaseType, id: number): Candidate | null {
  const row = db.prepare<[number], CandidateRow>('SELECT * FROM candidate WHERE id = ?').get(id);
  return row ? mapCandidate(row) : null;
}

export function getCandidates(db: DatabaseType, ids: number[]): Candidate[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare<number[], CandidateRow>(`SELECT * FROM candidate WHERE id IN (${placeholders})`)
    .all(...ids);
  return rows.map(mapCandidate);
}

export function deleteCandidate(db: DatabaseType, id: number): void {
  db.prepare('DELETE FROM candidate WHERE id = ?').run(id);
}

interface CachedSearchRow {
  cache_key: string;
  query_json: string;
  provider: string;
  candidate_ids: string;
  fetched_at: string;
}

export interface CachedSearch {
  cacheKey: string;
  queryJson: string;
  provider: string;
  candidateIds: number[];
  fetchedAt: string;
}

function mapCache(r: CachedSearchRow): CachedSearch {
  return {
    cacheKey: r.cache_key,
    queryJson: r.query_json,
    provider: r.provider,
    candidateIds: JSON.parse(r.candidate_ids) as number[],
    fetchedAt: r.fetched_at,
  };
}

export function getCachedSearch(
  db: DatabaseType,
  cacheKey: string,
  maxAgeMs: number,
): CachedSearch | null {
  const row = db
    .prepare<[string], CachedSearchRow>('SELECT * FROM search_cache WHERE cache_key = ?')
    .get(cacheKey);
  if (!row) return null;
  const ageMs = Date.now() - new Date(row.fetched_at + 'Z').getTime();
  if (ageMs > maxAgeMs) return null;
  return mapCache(row);
}

export function putCachedSearch(
  db: DatabaseType,
  cacheKey: string,
  queryJson: string,
  provider: string,
  candidateIds: number[],
): void {
  db.prepare(
    `INSERT INTO search_cache (cache_key, query_json, provider, candidate_ids)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (cache_key) DO UPDATE SET
       query_json = excluded.query_json,
       provider = excluded.provider,
       candidate_ids = excluded.candidate_ids,
       fetched_at = datetime('now')`,
  ).run(cacheKey, queryJson, provider, JSON.stringify(candidateIds));
}

export function pruneSearchCache(db: DatabaseType, maxAgeMs: number): number {
  const cutoffMinutes = Math.ceil(maxAgeMs / 60_000);
  const info = db
    .prepare(`DELETE FROM search_cache WHERE fetched_at < datetime('now', '-' || ? || ' minutes')`)
    .run(cutoffMinutes);
  return Number(info.changes);
}

export function promoteCandidateToProperty(
  db: DatabaseType,
  candidateId: number,
): Property | null {
  const candidate = getCandidate(db, candidateId);
  if (!candidate) return null;
  const sourceKind: SourceKind = candidate.provider;
  const sourceId = getOrCreateSource(db, sourceKind);

  const existing = db
    .prepare<[Provider, string], { id: number }>(
      'SELECT id FROM property WHERE provider = ? AND external_id = ?',
    )
    .get(candidate.provider, candidate.externalId);
  if (existing) {
    return upsertProperty(db, {
      sourceId,
      provider: candidate.provider,
      externalId: candidate.externalId,
      name: candidate.name,
      url: candidate.url,
      lat: candidate.lat,
      lng: candidate.lng,
      priceLabel: candidate.priceLabel,
      photoUrl: candidate.photoUrl,
      rawJson: candidate.rawJson,
      enrichedAt: new Date().toISOString(),
    });
  }

  const stmt = db.prepare(`
    INSERT INTO property
      (source_id, provider, external_id, name, url, lat, lng, price_label, photo_url,
       raw_json, enriched_at, promoted_from_candidate_id)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `);
  const row = stmt.get(
    sourceId,
    candidate.provider,
    candidate.externalId,
    candidate.name,
    candidate.url,
    candidate.lat,
    candidate.lng,
    candidate.priceLabel,
    candidate.photoUrl,
    candidate.rawJson,
    new Date().toISOString(),
    candidate.id,
  ) as PropertyRow & { promoted_from_candidate_id: number | null };
  return mapProperty(row);
}
