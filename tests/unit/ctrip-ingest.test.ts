import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { hotelIdFromUrl, parseCtripDetail, ingestCtrip } from '../../src/ingest/ctrip.ts';
import { openDb, listProperties } from '../../src/db/repo.ts';
import type { Geocoder } from '../../src/ingest/geocode.ts';

const detailHtml = readFileSync('tests/fixtures/ctrip-detail.html', 'utf8');
const fixedGeocoder: Geocoder = { geocode: async () => ({ lat: 31.2397, lng: 121.4903 }) };

describe('hotelIdFromUrl', () => {
  it('parses /hotels/<id>.html', () => {
    expect(hotelIdFromUrl('https://hotels.ctrip.com/hotels/4889292.html')).toBe('4889292');
  });
  it('parses /hotel/<id>.html', () => {
    expect(hotelIdFromUrl('https://hotels.ctrip.com/hotel/4889292.html')).toBe('4889292');
  });
  it('parses ?hotelId=<id>', () => {
    expect(hotelIdFromUrl('https://hotels.ctrip.com/hotels/detail/?hotelId=4889292')).toBe(
      '4889292',
    );
  });
  it('returns null when absent', () => {
    expect(hotelIdFromUrl('https://hotels.ctrip.com/')).toBeNull();
  });
});

describe('parseCtripDetail', () => {
  it('extracts name from title and address from the addressDesc span', () => {
    const d = parseCtripDetail(detailHtml);
    expect(d.name).toBe('上海外滩瑞吉酒店');
    expect(d.address).toBe('上海黄浦区中山东二路538号');
  });
});

describe('ingestCtrip', () => {
  it('scrapes URL, geocodes address, and upserts a ctrip property', async () => {
    const db = openDb(':memory:');
    const res = await ingestCtrip(db, {
      geocoder: fixedGeocoder,
      entries: [{ url: 'https://hotels.ctrip.com/hotels/4889292.html' }],
      fetchHtml: async () => detailHtml,
    });
    expect(res.enriched).toBe(1);
    const props = listProperties(db).filter((p) => p.provider === 'ctrip');
    expect(props).toHaveLength(1);
    expect(props[0]!.externalId).toBe('4889292');
    expect(props[0]!.name).toBe('上海外滩瑞吉酒店');
    expect(props[0]!.lat).toBeCloseTo(31.2397, 4);
    db.close();
  });

  it('falls back to provided name/address when the URL fetch is blocked', async () => {
    const db = openDb(':memory:');
    const res = await ingestCtrip(db, {
      geocoder: fixedGeocoder,
      entries: [
        { url: 'https://hotels.ctrip.com/hotels/555.html', name: '备用酒店', address: '北京市朝阳区' },
      ],
      fetchHtml: async () => {
        throw new Error('403 anti-bot');
      },
    });
    expect(res.enriched).toBe(1);
    const props = listProperties(db).filter((p) => p.provider === 'ctrip');
    expect(props[0]!.name).toBe('备用酒店');
    expect(props[0]!.externalId).toBe('555');
    db.close();
  });

  it('fails an entry when the URL is blocked and no fallback address is given', async () => {
    const db = openDb(':memory:');
    const res = await ingestCtrip(db, {
      geocoder: fixedGeocoder,
      entries: [{ url: 'https://hotels.ctrip.com/hotels/777.html' }],
      fetchHtml: async () => {
        throw new Error('403 anti-bot');
      },
    });
    expect(res.enriched).toBe(0);
    expect(res.failed).toHaveLength(1);
    db.close();
  });
});
