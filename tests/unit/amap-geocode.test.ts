import { describe, it, expect } from 'vitest';
import { createAmapGeocoder } from '../../src/search/providers/amap-geocode.ts';

describe('amap geocoder', () => {
  it('geocodes an address and returns WGS-84', async () => {
    const geo = createAmapGeocoder({
      apiKey: 'K',
      fetchJson: async () => ({ status: '1', geocodes: [{ location: '120.150000,30.250000' }] }),
    });
    const r = await geo.geocode('杭州市西湖区龙井路1号');
    expect(r).not.toBeNull();
    expect(r!.lng).toBeCloseTo(120.14529, 4);
    expect(r!.lat).toBeCloseTo(30.25232, 4);
  });

  it('returns null on no match', async () => {
    const geo = createAmapGeocoder({
      apiKey: 'K',
      fetchJson: async () => ({ status: '1', geocodes: [] }),
    });
    expect(await geo.geocode('nowhere')).toBeNull();
  });
});
