import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingDIYProvider } from '../../src/search/providers/booking-diy.ts';
import type { SearchQuery } from '../../src/search/types.ts';

const SEARCH_HTML = `
<html><body>
<div data-component="wishlist/Item" data-hotel-id="111">
  <a href="https://www.booking.com/hotel/gb/one.html">Hotel One</a>
</div>
<div data-component="wishlist/Item" data-hotel-id="222">
  <a href="https://www.booking.com/hotel/gb/two.html">Hotel Two</a>
</div>
<div data-component="wishlist/Item" data-hotel-id="333">
  <a href="https://www.booking.com/hotel/gb/three.html">Hotel Three</a>
</div>
</body></html>`;

const DETAIL_HTML = (lat: number, lng: number, name: string) => `
<html><head>
<script type="application/ld+json">
${JSON.stringify({
  '@type': 'Hotel',
  name,
  geo: { latitude: lat, longitude: lng },
})}
</script>
</head><body></body></html>`;

const QUERY: SearchQuery = {
  bbox: { north: 1, south: 0, east: 1, west: 0 },
  zoom: 12,
  checkin: null,
  checkout: null,
  guests: { adults: 2, children: 0, infants: 0, pets: 0 },
  currency: 'GBP',
  maxResults: 50,
};

describe('BookingDIYProvider per-detail error surface', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('logs a console.warn for every failed detail fetch and still returns the successes', async () => {
    const fetchHtml = vi.fn(async (url: string) => {
      if (url.includes('searchresults')) return SEARCH_HTML;
      if (url.includes('one.html')) return DETAIL_HTML(57.1, -3.8, 'Hotel One');
      if (url.includes('two.html')) throw new Error('CAPTCHA on two');
      if (url.includes('three.html')) return DETAIL_HTML(57.2, -3.9, 'Hotel Three');
      throw new Error(`unexpected url ${url}`);
    });

    const provider = new BookingDIYProvider({
      fetchHtml,
      perRequestDelayMs: 0,
      maxDetailFetches: 10,
      geocoder: { geocode: async () => null },
    });

    const results = await provider.search(QUERY);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.externalId).sort()).toEqual(['one', 'three']);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0]?.[0] as string;
    expect(message).toContain('[booking-diy]');
    expect(message).toContain('two.html');
    expect(message).toContain('CAPTCHA on two');
  });

  it('warns once per failing card; total warnings equal failure count', async () => {
    const fetchHtml = vi.fn(async (url: string) => {
      if (url.includes('searchresults')) return SEARCH_HTML;
      throw new Error('blocked');
    });

    const provider = new BookingDIYProvider({
      fetchHtml,
      perRequestDelayMs: 0,
      maxDetailFetches: 10,
      geocoder: { geocode: async () => null },
    });

    const results = await provider.search(QUERY);
    expect(results).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });
});
