import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dryRunAirbnb } from '../../src/ingest/airbnb.ts';

const FIXTURE = join(process.cwd(), 'tests', 'fixtures', 'airbnb', 'personal_data.sample.json');

describe('dryRunAirbnb', () => {
  it('returns parsed refs without touching the network or DB', () => {
    const r = dryRunAirbnb(FIXTURE);
    expect(r.total).toBe(4);
    expect(r.refs).toHaveLength(4);
    expect(r.refs.every((x) => x.url.startsWith('https://www.airbnb.com/rooms/'))).toBe(true);
  });
});
