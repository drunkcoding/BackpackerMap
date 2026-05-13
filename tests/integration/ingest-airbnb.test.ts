import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Database } from 'better-sqlite3';
import { openDb, listProperties } from '../../src/db/repo.ts';
import { ingestAirbnb } from '../../src/ingest/airbnb.ts';

const MOCK = join(process.cwd(), 'scripts', '__mock_pyairbnb.py');
const FIXTURE = join(process.cwd(), 'tests', 'fixtures', 'airbnb', 'personal_data.sample.json');
const PYTHON_BIN = process.env['PYTHON_BIN'] ?? (process.platform === 'win32' ? 'python' : 'python3');

describe('ingestAirbnb (integration with mock Python)', () => {
  it('enriches every wishlisted listing into property rows', async () => {
    const db: Database = openDb(':memory:');
    try {
      const result = await ingestAirbnb(FIXTURE, db, {
        scriptPath: MOCK,
        pythonBin: PYTHON_BIN,
        timeoutMs: 5_000,
        retries: 0,
        concurrency: 2,
      });

      expect(result.total).toBe(4);
      expect(result.enriched).toBe(4);
      expect(result.failed).toEqual([]);

      const props = listProperties(db);
      expect(props).toHaveLength(4);
      for (const p of props) {
        expect(p.provider).toBe('airbnb');
        expect(p.lat).toBe(56.7867);
        expect(p.lng).toBe(-5.0035);
        expect(p.enrichedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
        expect(p.priceLabel).toBe('$120 / night');
      }
    } finally {
      db.close();
    }
  });

  it('records failures but does not abort the run', async () => {
    const db: Database = openDb(':memory:');
    try {
      const result = await ingestAirbnb(FIXTURE, db, {
        scriptPath: MOCK,
        pythonBin: PYTHON_BIN,
        timeoutMs: 5_000,
        retries: 0,
        concurrency: 2,
        env: { MOCK_PYAIRBNB_BEHAVIOUR: 'fail' },
      });

      expect(result.total).toBe(4);
      expect(result.enriched).toBe(0);
      expect(result.failed).toHaveLength(4);
      expect(listProperties(db)).toHaveLength(0);
    } finally {
      db.close();
    }
  });
});
