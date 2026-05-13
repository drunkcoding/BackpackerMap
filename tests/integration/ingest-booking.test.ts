import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from 'better-sqlite3';
import { openDb, listProperties } from '../../src/db/repo.ts';
import { ingestBooking } from '../../src/ingest/booking.ts';
import { createNominatimGeocoder } from '../../src/ingest/geocode.ts';

const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'booking');

function html(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8');
}

describe('ingestBooking (integration with stubbed fetcher)', () => {
  it('scrapes wishlist, enriches each hotel via JSON-LD, writes property rows', async () => {
    const db: Database = openDb(':memory:');
    try {
      const responses: Record<string, string> = {
        'https://www.booking.com/mywishlist.html': html('wishlist.sample.html'),
        'https://www.booking.com/hotel/gb/cairngorms-lodge.en-gb.html': html(
          'detail-hotel.sample.html',
        ),
        'https://www.booking.com/hotel/gb/loch-ness-inn.en-gb.html': html(
          'detail-lodging.sample.html',
        ),
      };

      const result = await ingestBooking(db, {
        fetchHtml: async (url) => {
          const body = responses[url];
          if (!body) throw new Error(`unexpected URL: ${url}`);
          return body;
        },
        geocoder: null,
      });

      expect(result.total).toBe(2);
      expect(result.enriched).toBe(2);
      expect(result.failed).toEqual([]);

      const props = listProperties(db).sort((a, b) => a.externalId.localeCompare(b.externalId));
      expect(props).toHaveLength(2);

      expect(props[0]!.provider).toBe('booking');
      expect(props[0]!.externalId).toBe('cairngorms-lodge');
      expect(props[0]!.lat).toBeCloseTo(57.1959, 4);
      expect(props[0]!.lng).toBeCloseTo(-3.8262, 4);
      expect(props[0]!.priceLabel).toBe('£140-£220');

      expect(props[1]!.externalId).toBe('loch-ness-inn');
      expect(props[1]!.lat).toBe(57.3);
    } finally {
      db.close();
    }
  });

  it('records per-listing failures without aborting the run', async () => {
    const db: Database = openDb(':memory:');
    try {
      const result = await ingestBooking(db, {
        fetchHtml: async (url) => {
          if (url.endsWith('mywishlist.html')) {
            return html('wishlist.sample.html');
          }
          throw new Error('detail page unreachable');
        },
        geocoder: null,
      });

      expect(result.total).toBe(2);
      expect(result.enriched).toBe(0);
      expect(result.failed).toHaveLength(2);
      expect(listProperties(db)).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it('falls back to Nominatim geocoder when JSON-LD lacks geo but has address', async () => {
    const db: Database = openDb(':memory:');
    try {
      const wishlistHtml = `<a href="/hotel/gb/no-geo.en-gb.html"><h3>No Geo Inn</h3></a>`;
      const detailHtml = `
        <script type="application/ld+json">
          {"@type":"Hotel","name":"No Geo Inn","address":{"@type":"PostalAddress","streetAddress":"1 Test St","addressLocality":"Aviemore","addressCountry":"GB"}}
        </script>`;
      const fetchImpl = vi.fn(async () =>
        new Response(JSON.stringify([{ lat: '57.1958', lon: '-3.8262' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      const geocoder = createNominatimGeocoder({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sleep: async () => {},
      });

      const result = await ingestBooking(db, {
        fetchHtml: async (url) =>
          url.endsWith('mywishlist.html') ? wishlistHtml : detailHtml,
        geocoder,
      });

      expect(result.enriched).toBe(1);
      const props = listProperties(db);
      expect(props).toHaveLength(1);
      expect(props[0]!.lat).toBeCloseTo(57.1958, 4);
      expect(props[0]!.lng).toBeCloseTo(-3.8262, 4);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      db.close();
    }
  });
});
