import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { migrate } from '../../src/db/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', '..', 'src', 'db', 'migrations');

function loadMigration(name: string): string {
  return readFileSync(join(migrationsDir, name), 'utf8');
}

function openPopulatedV2Db(): DatabaseType {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(loadMigration('0001_init.sql'));
  db.exec(loadMigration('0002_candidate.sql'));

  db.exec(`CREATE TABLE _migration (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const recordStmt = db.prepare('INSERT INTO _migration (name) VALUES (?)');
  recordStmt.run('0001_init.sql');
  recordStmt.run('0002_candidate.sql');

  db.exec(`
    INSERT INTO source (kind) VALUES ('alltrails'), ('airbnb');
    INSERT INTO trail (source_id, external_id, name, trailhead_lat, trailhead_lng, geojson, raw_path)
      VALUES (1, 't1.gpx', 'T1', 57.0, -3.7, '{"type":"LineString","coordinates":[]}', '/tmp/t1.gpx');
    INSERT INTO property (source_id, provider, external_id, name, url, lat, lng, raw_json)
      VALUES (2, 'airbnb', 'P1', 'P1', 'https://example.com', 56.7867, -5.0035, '{}');
    INSERT INTO candidate (provider, external_id, name, url, lat, lng, raw_json)
      VALUES ('airbnb', 'C1', 'Candidate cabin', 'https://example.com/c', 56.5, -4.0, '{}');
    INSERT INTO distance_cache (property_id, trail_id, meters, seconds)
      VALUES (1, 1, 42000, 2280);
  `);

  return db;
}

describe('migration 0003_pois', () => {
  it('runs on a populated v1+v2 database without losing data', () => {
    const db = openPopulatedV2Db();
    try {
      expect(() => migrate(db)).not.toThrow();

      const sources = db
        .prepare<[], { id: number; kind: string }>('SELECT id, kind FROM source ORDER BY id')
        .all();
      expect(sources).toEqual([
        { id: 1, kind: 'alltrails' },
        { id: 2, kind: 'airbnb' },
      ]);

      const trail = db
        .prepare<[], { id: number; kind: string }>(
          'SELECT t.id AS id, s.kind AS kind FROM trail t JOIN source s ON s.id = t.source_id',
        )
        .get();
      expect(trail).toEqual({ id: 1, kind: 'alltrails' });

      const property = db
        .prepare<[], { id: number; kind: string }>(
          'SELECT p.id AS id, s.kind AS kind FROM property p JOIN source s ON s.id = p.source_id',
        )
        .get();
      expect(property).toEqual({ id: 1, kind: 'airbnb' });

      const candidateCount = db
        .prepare<[], { c: number }>('SELECT COUNT(*) AS c FROM candidate')
        .get();
      expect(candidateCount?.c).toBe(1);
    } finally {
      db.close();
    }
  });

  it('creates poi + route_cache, drops distance_cache', () => {
    const db = openPopulatedV2Db();
    try {
      migrate(db);

      const tables = db
        .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => r.name);
      expect(tables).toContain('poi');
      expect(tables).toContain('route_cache');
      expect(tables).not.toContain('distance_cache');

      const poiCols = db
        .prepare<[], { name: string }>("SELECT name FROM pragma_table_info('poi')")
        .all()
        .map((r) => r.name);
      expect(poiCols).toEqual(
        expect.arrayContaining([
          'id', 'source_id', 'collection', 'external_id', 'name',
          'lat', 'lng', 'category', 'note', 'url', 'address', 'raw', 'ingested_at',
        ]),
      );

      const routeCols = db
        .prepare<[], { name: string }>("SELECT name FROM pragma_table_info('route_cache')")
        .all()
        .map((r) => r.name);
      expect(routeCols).toEqual(
        expect.arrayContaining([
          'property_id', 'target_kind', 'target_id', 'meters', 'seconds', 'computed_at',
        ]),
      );
    } finally {
      db.close();
    }
  });

  it('leaves PRAGMA foreign_keys = ON after migration', () => {
    const db = openPopulatedV2Db();
    try {
      migrate(db);

      const fk = db.pragma('foreign_keys', { simple: true });
      expect(fk).toBe(1);

      const violations = db
        .prepare<[], unknown>('PRAGMA foreign_key_check')
        .all();
      expect(violations).toEqual([]);

      expect(() =>
        db
          .prepare(
            `INSERT INTO trail (source_id, external_id, name, trailhead_lat, trailhead_lng, geojson, raw_path)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(99999, 'bad.gpx', 'bad', 0, 0, '{}', '/tmp/bad.gpx'),
      ).toThrow(/FOREIGN KEY/);
    } finally {
      db.close();
    }
  });

  it('extends source.kind CHECK to accept google_maps', () => {
    const db = openPopulatedV2Db();
    try {
      migrate(db);

      const info = db.prepare('INSERT INTO source (kind) VALUES (?)').run('google_maps');
      expect(Number(info.lastInsertRowid)).toBeGreaterThan(0);

      expect(() => db.prepare('INSERT INTO source (kind) VALUES (?)').run('twitter')).toThrow(
        /CHECK/,
      );
    } finally {
      db.close();
    }
  });

  it('is idempotent: running migrate twice is a no-op the second time', () => {
    const db = openPopulatedV2Db();
    try {
      migrate(db);
      const before = db.prepare<[], { c: number }>('SELECT COUNT(*) AS c FROM source').get();
      expect(() => migrate(db)).not.toThrow();
      const after = db.prepare<[], { c: number }>('SELECT COUNT(*) AS c FROM source').get();
      expect(after?.c).toBe(before?.c);
    } finally {
      db.close();
    }
  });
});
