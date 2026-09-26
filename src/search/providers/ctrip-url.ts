import type { BBox, SearchQuery } from '../types.ts';

const CITY_TABLE: Array<{ cityId: number; lat: number; lng: number }> = [
  { cityId: 1, lat: 39.9042, lng: 116.4074 },
  { cityId: 2, lat: 31.2304, lng: 121.4737 },
  { cityId: 17, lat: 30.2741, lng: 120.1551 },
  { cityId: 28, lat: 34.3416, lng: 108.9398 },
  { cityId: 32, lat: 23.1291, lng: 113.2644 },
  { cityId: 43, lat: 18.2528, lng: 109.5119 },
];

function todayPlus(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function bboxToCityId(bbox: BBox): number {
  const cLat = (bbox.north + bbox.south) / 2;
  const cLng = (bbox.east + bbox.west) / 2;
  let best = CITY_TABLE[0]!;
  let bestD = Infinity;
  for (const c of CITY_TABLE) {
    const d = (c.lat - cLat) ** 2 + (c.lng - cLng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best.cityId;
}

export function buildCtripListUrl(query: SearchQuery): string {
  const u = new URL('https://hotels.ctrip.com/hotels/list');
  u.searchParams.set('flexType', '1');
  u.searchParams.set('cityId', String(bboxToCityId(query.bbox)));
  u.searchParams.set('provinceId', '0');
  u.searchParams.set('districtId', '0');
  u.searchParams.set('countryId', '1');
  u.searchParams.set('checkin', query.checkin ?? todayPlus(1));
  u.searchParams.set('checkout', query.checkout ?? todayPlus(2));
  return u.toString();
}
