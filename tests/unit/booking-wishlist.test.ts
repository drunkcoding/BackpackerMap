import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseWishlistHtml } from '../../src/ingest/booking.ts';

const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'booking');

describe('parseWishlistHtml', () => {
  it('extracts hotel cards, deduplicates by hotel id, ignores non-hotel links', () => {
    const html = readFileSync(join(FIXTURE_DIR, 'wishlist.sample.html'), 'utf8');
    const items = parseWishlistHtml(html);

    expect(items.map((i) => i.hotelId).sort()).toEqual([
      'cairngorms-lodge',
      'loch-ness-inn',
    ]);

    const cairngorms = items.find((i) => i.hotelId === 'cairngorms-lodge');
    expect(cairngorms?.name).toBe('Cairngorms Lodge');
    expect(cairngorms?.url).toBe('https://www.booking.com/hotel/gb/cairngorms-lodge.en-gb.html');

    const lochNess = items.find((i) => i.hotelId === 'loch-ness-inn');
    expect(lochNess?.url).toBe('https://www.booking.com/hotel/gb/loch-ness-inn.en-gb.html');
  });

  it('returns empty array for an empty page', () => {
    expect(parseWishlistHtml('<html><body></body></html>')).toEqual([]);
  });
});
