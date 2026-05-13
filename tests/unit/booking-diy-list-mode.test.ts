import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BookingDIYProvider } from '../../src/search/providers/booking-diy.ts';
import type { SearchQuery } from '../../src/search/types.ts';

const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'booking');

function load(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8');
}

function makeQuery(over: Partial<SearchQuery> = {}): SearchQuery {
  return {
    bbox: { north: 57.2, south: 57.0, east: -3.7, west: -3.9 },
    zoom: 11,
    checkin: '2026-07-01',
    checkout: '2026-07-07',
    guests: { adults: 2, children: 0, infants: 0 },
    currency: 'GBP',
    maxResults: 50,
    ...over,
  };
}

describe('BookingDIYProvider list mode', () => {
  it('list mode caps detail fetches and uses parallel workers', async () => {
    const searchHtml = load('search.sample.html');
    const detailHtml = load('detail-hotel.sample.html');
    const fetchHtml = vi.fn(async (url: string) =>
      url.includes('/searchresults.html') ? searchHtml : detailHtml,
    );
    const p = new BookingDIYProvider({
      fetchHtml,
      geocoder: null,
      listMode: { concurrency: 2, maxDetailFetches: 1, perRequestDelayMs: 0 },
      maxDetailFetches: 30,
      perRequestDelayMs: 5000,
    });
    const out = await p.search(makeQuery({ mode: 'list' }));
    expect(out).toHaveLength(1);
    expect(fetchHtml).toHaveBeenCalledTimes(2);
  });

  it('list mode runs detail fetches in parallel (overlapping in time)', async () => {
    const searchHtml = load('search.sample.html');
    const detailHtml = load('detail-hotel.sample.html');
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchHtml = vi.fn(async (url: string) => {
      if (url.includes('/searchresults.html')) return searchHtml;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 30));
      inFlight -= 1;
      return detailHtml;
    });
    const p = new BookingDIYProvider({
      fetchHtml,
      geocoder: null,
      listMode: { concurrency: 2, maxDetailFetches: 2, perRequestDelayMs: 0 },
    });
    await p.search(makeQuery({ mode: 'list' }));
    expect(maxInFlight).toBe(2);
  });

  it('detail mode is serial (concurrency 1) even when listMode is set', async () => {
    const searchHtml = load('search.sample.html');
    const detailHtml = load('detail-hotel.sample.html');
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchHtml = vi.fn(async (url: string) => {
      if (url.includes('/searchresults.html')) return searchHtml;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight -= 1;
      return detailHtml;
    });
    const p = new BookingDIYProvider({
      fetchHtml,
      geocoder: null,
      perRequestDelayMs: 0,
      listMode: { concurrency: 5, maxDetailFetches: 5, perRequestDelayMs: 0 },
    });
    await p.search(makeQuery({ mode: 'detail' }));
    expect(maxInFlight).toBe(1);
  });

  it('default mode (unset) is list mode', async () => {
    const searchHtml = load('search.sample.html');
    const detailHtml = load('detail-hotel.sample.html');
    const fetchHtml = vi.fn(async (url: string) =>
      url.includes('/searchresults.html') ? searchHtml : detailHtml,
    );
    const p = new BookingDIYProvider({
      fetchHtml,
      geocoder: null,
      listMode: { concurrency: 1, maxDetailFetches: 1, perRequestDelayMs: 0 },
      maxDetailFetches: 30,
    });
    const out = await p.search(makeQuery());
    expect(out).toHaveLength(1);
    expect(fetchHtml).toHaveBeenCalledTimes(2);
  });
});

describe('SearchQuery.mode default', () => {
  it('cache key differs by mode value (canonicalisation includes mode)', async () => {
    const { cacheKey, canonicaliseQuery } = await import('../../src/search/canonical.ts');
    const base = makeQuery();
    const list = cacheKey(canonicaliseQuery({ ...base, mode: 'list' }), 'all');
    const detail = cacheKey(canonicaliseQuery({ ...base, mode: 'detail' }), 'all');
    expect(list).not.toBe(detail);
  });
});
