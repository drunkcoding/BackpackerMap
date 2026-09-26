import { describe, it, expect } from 'vitest';
import { bboxToCityId, buildCtripListUrl } from '../../src/search/providers/ctrip-url.ts';
import type { SearchQuery } from '../../src/search/types.ts';

const q: SearchQuery = {
  bbox: { north: 30.35, south: 30.15, east: 120.25, west: 120.05 },
  zoom: 12,
  checkin: '2026-10-01',
  checkout: '2026-10-02',
  guests: { adults: 2, children: 0, infants: 0 },
  currency: 'CNY',
  maxResults: 25,
};

describe('ctrip-url', () => {
  it('maps a bbox centre to the nearest known cityId', () => {
    expect(bboxToCityId(q.bbox)).toBe(17);
  });

  it('builds the canonical six-param URL', () => {
    const url = new URL(buildCtripListUrl(q));
    expect(url.origin + url.pathname).toBe('https://hotels.ctrip.com/hotels/list');
    expect(url.searchParams.get('flexType')).toBe('1');
    expect(url.searchParams.get('cityId')).toBe('17');
    expect(url.searchParams.get('provinceId')).toBe('0');
    expect(url.searchParams.get('districtId')).toBe('0');
    expect(url.searchParams.get('countryId')).toBe('1');
    expect(url.searchParams.get('checkin')).toBe('2026-10-01');
    expect(url.searchParams.get('checkout')).toBe('2026-10-02');
  });
});
