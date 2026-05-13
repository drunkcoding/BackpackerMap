import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseExport } from '../../src/ingest/airbnb.ts';

const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'airbnb');

function load(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8'));
}

describe('parseExport (Airbnb personal data)', () => {
  it('extracts listing IDs and URLs from wishlists', () => {
    const refs = parseExport(load('personal_data.sample.json'));
    expect(refs.map((r) => r.id).sort()).toEqual(['11111', '12345', '22222', '67890']);
    expect(refs.every((r) => r.url.startsWith('https://www.airbnb.com/rooms/'))).toBe(true);
  });

  it('deduplicates by listing id', () => {
    const dup = {
      Wishlists: [
        { listings: [{ listing_id: 1, listing_url: 'https://www.airbnb.com/rooms/1' }] },
        { listings: [{ listing_id: 1, listing_url: 'https://www.airbnb.com/rooms/1' }] },
      ],
    };
    expect(parseExport(dup)).toEqual([{ id: '1', url: 'https://www.airbnb.com/rooms/1' }]);
  });

  it('synthesises URL from listing id when missing', () => {
    const refs = parseExport({
      Wishlists: [{ listings: [{ listing_id: 99 }] }],
    });
    expect(refs).toEqual([{ id: '99', url: 'https://www.airbnb.com/rooms/99' }]);
  });

  it('extracts listing id from URL when raw id missing', () => {
    const refs = parseExport({
      Wishlists: [{ listings: [{ url: 'https://www.airbnb.com/rooms/424242' }] }],
    });
    expect(refs).toEqual([{ id: '424242', url: 'https://www.airbnb.com/rooms/424242' }]);
  });

  it('tolerates missing Wishlists key', () => {
    expect(parseExport(load('empty.sample.json'))).toEqual([]);
  });

  it('tolerates non-object input', () => {
    expect(parseExport(null)).toEqual([]);
    expect(parseExport(42)).toEqual([]);
    expect(parseExport([])).toEqual([]);
  });
});
