import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from 'better-sqlite3';
import { openDb, listTrails } from '../../src/db/repo.ts';
import { ingestTrails } from '../../src/ingest/trails.ts';

const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'trails');

function gpx(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8');
}

describe('ingestTrails (integration)', () => {
  let db: Database;
  let tmpRoot: string;

  beforeEach(() => {
    db = openDb(':memory:');
    tmpRoot = mkdtempSync(join(tmpdir(), 'bpm-trails-'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('walks recursively and ingests GPX at top level and nested', async () => {
    writeFileSync(join(tmpRoot, 'a.gpx'), gpx('simple.gpx'));
    mkdirSync(join(tmpRoot, 'scotland'), { recursive: true });
    writeFileSync(join(tmpRoot, 'scotland', 'b.gpx'), gpx('nested/scotland/loch-ness.gpx'));

    const result = await ingestTrails(tmpRoot, db);

    expect(result.errors).toEqual([]);
    expect(result.ingested).toBe(2);

    const trails = listTrails(db);
    expect(trails).toHaveLength(2);

    const ids = trails.map((t) => t.externalId).sort();
    expect(ids).toEqual(['a.gpx', 'scotland/b.gpx']);

    for (const t of trails) {
      const geo = JSON.parse(t.geojson) as { type: string };
      expect(geo.type).toBe('LineString');
    }
  });

  it('is idempotent: re-running on the same dir keeps row count', async () => {
    writeFileSync(join(tmpRoot, 'a.gpx'), gpx('simple.gpx'));
    mkdirSync(join(tmpRoot, 'sub'), { recursive: true });
    writeFileSync(join(tmpRoot, 'sub', 'b.gpx'), gpx('multi-segment.gpx'));

    await ingestTrails(tmpRoot, db);
    await ingestTrails(tmpRoot, db);

    expect(listTrails(db)).toHaveLength(2);
  });

  it('ignores node_modules subfolders', async () => {
    writeFileSync(join(tmpRoot, 'real.gpx'), gpx('simple.gpx'));
    mkdirSync(join(tmpRoot, 'node_modules', 'evil'), { recursive: true });
    writeFileSync(join(tmpRoot, 'node_modules', 'evil', 'bad.gpx'), gpx('simple.gpx'));

    const result = await ingestTrails(tmpRoot, db);
    expect(result.ingested).toBe(1);
    expect(listTrails(db).map((t) => t.externalId)).toEqual(['real.gpx']);
  });
});
