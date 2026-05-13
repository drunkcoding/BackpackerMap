#!/usr/bin/env tsx
/**
 * One-shot purge of poisoned empty-result rows from the search_cache table.
 *
 * Background: until the fix in src/server/routes/search.ts (don't cache when
 * dispatched.warnings.length > 0), partial provider failures would cache an
 * empty `[]` for 10 minutes, so subsequent identical-bbox searches served
 * "no results" even when at least one provider would have worked on retry.
 *
 * This script is safe to run multiple times. It only deletes rows whose
 * candidate_ids equals the literal '[]'.
 *
 * Usage:
 *   tsx scripts/cleanup_search_cache.ts             # uses DB_PATH or db/backpackermap.sqlite
 *   DB_PATH=/path/to.sqlite tsx scripts/cleanup_search_cache.ts
 */
import { resolve } from 'node:path';
import Database from 'better-sqlite3';

const dbPath = resolve(process.env['DB_PATH'] ?? 'db/backpackermap.sqlite');
const db = new Database(dbPath);

const before = db.prepare<[], { c: number }>(`SELECT COUNT(*) AS c FROM search_cache`).get();
const empties = db
  .prepare<[], { c: number }>(`SELECT COUNT(*) AS c FROM search_cache WHERE candidate_ids = '[]'`)
  .get();

console.log(`[cleanup] DB: ${dbPath}`);
console.log(`[cleanup] search_cache rows total:        ${before?.c ?? 0}`);
console.log(`[cleanup] search_cache rows with '[]':    ${empties?.c ?? 0}`);

const info = db.prepare(`DELETE FROM search_cache WHERE candidate_ids = '[]'`).run();
console.log(`[cleanup] deleted ${info.changes} poisoned cache row(s).`);

db.close();
