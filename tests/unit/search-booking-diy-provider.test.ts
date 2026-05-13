import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  BookingDIYProvider,
  parseBookingSearchHtml,
} from '../../src/search/providers/booking-diy.ts';
import { createNominatimGeocoder } from '../../src/ingest/geocode.ts';
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
    maxResults: 5,
    ...over,
  };
}

describe('parseBookingSearchHtml', () => {
  it('extracts hotels with name, url, thumbnail, price, review_score, review_count', () => {
    const cards = parseBookingSearchHtml(load('search.sample.html'));
    expect(cards).toHaveLength(2);
    const cairngorms = cards.find((c) => c.hotelId === 'cairngorms-lodge')!;
    expect(cairngorms.name).toBe('Cairngorms Lodge');
    expect(cairngorms.thumbnail).toContain('cairngorms.jpg');
    expect(cairngorms.pricePerNight).toBe('£140');
    expect(cairngorms.reviewScore).toBe(8.9);
    expect(cairngorms.reviewCount).toBe(312);
  });

  it('returns empty for empty page', () => {
    expect(parseBookingSearchHtml('<html><body></body></html>')).toEqual([]);
  });
});

describe('BookingDIYProvider', () => {
  it('returns results with lat/lng from JSON-LD on detail pages', async () => {
    const searchHtml = load('search.sample.html');
    const detailHtml = load('detail-hotel.sample.html');
    const fetchHtml = vi.fn(async (url: string) =>
      url.includes('/searchresults.html') ? searchHtml : detailHtml,
    );

    const p = new BookingDIYProvider({
      fetchHtml,
      perRequestDelayMs: 0,
      geocoder: null,
    });
    const out = await p.search(makeQuery());

    expect(out).toHaveLength(2);
    expect(out[0]!.provider).toBe('booking');
    expect(out[0]!.lat).toBeCloseTo(57.1959, 4);
    expect(out[0]!.lng).toBeCloseTo(-3.8262, 4);
  });

  it('falls back to Nominatim when JSON-LD lacks geo but has address', async () => {
    const searchHtml = load('search.sample.html');
    const detailHtml = `
      <script type="application/ld+json">
        {"@type":"Hotel","name":"No Geo","address":{"@type":"PostalAddress","streetAddress":"1 High St","addressLocality":"Aviemore","addressCountry":"GB"}}
      </script>`;
    const geocoderFetch = vi.fn(
      async () =>
        new Response(JSON.stringify([{ lat: '57.0', lon: '-3.8' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const geocoder = createNominatimGeocoder({
      fetchImpl: geocoderFetch as unknown as typeof fetch,
      sleep: async () => {},
    });
    const fetchHtml = vi.fn(async (url: string) =>
      url.includes('/searchresults.html') ? searchHtml : detailHtml,
    );

    const p = new BookingDIYProvider({
      fetchHtml,
      perRequestDelayMs: 0,
      geocoder,
    });
    const out = await p.search(makeQuery({ maxResults: 1 }));
    expect(out).toHaveLength(1);
    expect(out[0]!.lat).toBe(57.0);
    expect(out[0]!.lng).toBe(-3.8);
  });

  it('respects maxResults: only 1 detail fetch happens', async () => {
    const searchHtml = load('search.sample.html');
    const detailHtml = load('detail-hotel.sample.html');
    const fetchHtml = vi.fn(async (url: string) =>
      url.includes('/searchresults.html') ? searchHtml : detailHtml,
    );

    const p = new BookingDIYProvider({
      fetchHtml,
      perRequestDelayMs: 0,
      geocoder: null,
      maxDetailFetches: 1,
    });
    const out = await p.search(makeQuery({ maxResults: 1 }));
    expect(out).toHaveLength(1);
    expect(fetchHtml).toHaveBeenCalledTimes(2);
  });

  it('skips properties when both JSON-LD geo and address geocoding fail', async () => {
    const searchHtml = load('search.sample.html');
    const detailHtml = '<html><body>no jsonld</body></html>';
    const fetchHtml = vi.fn(async (url: string) =>
      url.includes('/searchresults.html') ? searchHtml : detailHtml,
    );
    const p = new BookingDIYProvider({ fetchHtml, perRequestDelayMs: 0, geocoder: null });
    expect(await p.search(makeQuery({ maxResults: 1 }))).toEqual([]);
  });

  it('empty search page returns []', async () => {
    const fetchHtml = vi.fn(async () => '<html><body></body></html>');
    const p = new BookingDIYProvider({ fetchHtml, perRequestDelayMs: 0, geocoder: null });
    expect(await p.search(makeQuery())).toEqual([]);
    expect(fetchHtml).toHaveBeenCalledTimes(1);
  });
});
