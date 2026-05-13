import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractJsonLd } from '../../src/ingest/booking.ts';

const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'booking');

function load(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8');
}

describe('extractJsonLd (Booking detail page)', () => {
  it('extracts lat/lng/name/photo/price from @type Hotel', () => {
    const r = extractJsonLd(load('detail-hotel.sample.html'));
    expect(r.lat).toBeCloseTo(57.1959, 4);
    expect(r.lng).toBeCloseTo(-3.8262, 4);
    expect(r.name).toBe('Cairngorms Lodge');
    expect(r.photo).toBe('https://cf.bstatic.com/xdata/images/hotel/cairngorms-1.jpg');
    expect(r.priceLabel).toBe('£140-£220');
  });

  it('extracts from @type LodgingBusiness wrapped in array', () => {
    const r = extractJsonLd(load('detail-lodging.sample.html'));
    expect(r.lat).toBe(57.3);
    expect(r.lng).toBe(-4.45);
    expect(r.name).toBe('Loch Ness Inn');
    expect(r.photo).toContain('loch-ness-1.jpg');
    expect(r.priceLabel).toBe('£90-£150');
  });

  it('returns nulls when no JSON-LD present', () => {
    const r = extractJsonLd('<html><body>no jsonld</body></html>');
    expect(r).toEqual({ lat: null, lng: null, name: null, photo: null, priceLabel: null, address: null });
  });

  it('extracts address from structured PostalAddress', () => {
    const html = `
      <script type="application/ld+json">
        {"@type":"Hotel","name":"X","address":{"@type":"PostalAddress","streetAddress":"1 High St","addressLocality":"Aviemore","addressCountry":"GB","postalCode":"PH22 1AB"}}
      </script>`;
    const r = extractJsonLd(html);
    expect(r.address).toBe('1 High St, Aviemore, PH22 1AB, GB');
  });

  it('uses string address as-is', () => {
    const html = `
      <script type="application/ld+json">
        {"@type":"Hotel","name":"X","address":"1 High St, Aviemore PH22 1AB"}
      </script>`;
    expect(extractJsonLd(html).address).toBe('1 High St, Aviemore PH22 1AB');
  });

  it('skips malformed JSON-LD blocks without throwing', () => {
    const html = `
      <script type="application/ld+json">{ not valid }</script>
      <script type="application/ld+json">
        {"@type":"Hotel","name":"Recovered","geo":{"latitude":1,"longitude":2}}
      </script>
    `;
    const r = extractJsonLd(html);
    expect(r.name).toBe('Recovered');
    expect(r.lat).toBe(1);
    expect(r.lng).toBe(2);
  });
});
