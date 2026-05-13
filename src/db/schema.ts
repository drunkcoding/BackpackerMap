import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from 'better-sqlite3';

const here = dirname(fileURLToPath(import.meta.url));

const MIGRATIONS = ['0001_init.sql', '0002_candidate.sql'];

export function migrate(db: Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migration (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const applied = new Set(
    db.prepare<[], { name: string }>('SELECT name FROM _migration').all().map((r) => r.name),
  );

  for (const name of MIGRATIONS) {
    if (applied.has(name)) continue;
    const sql = readFileSync(join(here, 'migrations', name), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO _migration (name) VALUES (?)').run(name);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
