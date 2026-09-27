import { describe, it, expect } from 'vitest';
import {
  createAmapRouter,
  createRegionRoutingClient,
  type RoutingClient,
} from '../../src/routing/amap.ts';
import type { DrivingDistance } from '../../src/routing/ors.ts';

function jsonFetch(body: unknown, capture?: (url: string) => void): typeof fetch {
  return (async (url: string) => {
    capture?.(url);
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as unknown as typeof fetch;
}

const amapBody = {
  status: '1',
  info: 'OK',
  route: {
    paths: [
      {
        distance: '1500',
        duration: '600',
        steps: [{ polyline: '116.480000,39.980000;116.490000,39.990000' }],
      },
    ],
  },
};

function stub(meters: number): { client: RoutingClient; calls: () => number } {
  let calls = 0;
  return {
    client: {
      getDrivingDistance: async (): Promise<DrivingDistance> => {
        calls++;
        return { meters, seconds: 1, geometry: null };
      },
    },
    calls: () => calls,
  };
}

describe('createAmapRouter', () => {
  it('converts WGS->GCJ for the request and GCJ->WGS for the geometry', async () => {
    let url = '';
    const router = createAmapRouter({
      apiKey: 'K',
      fetchImpl: jsonFetch(amapBody, (u) => {
        url = u;
      }),
    });
    const res = await router.getDrivingDistance(
      { lat: 39.98, lng: 116.48 },
      { lat: 40.0, lng: 116.47 },
    );
    const origin = new URL(url).searchParams.get('origin')!;
    const oLng = Number(origin.split(',')[0]);
    expect(oLng).toBeGreaterThan(116.48);
    expect(res.meters).toBe(1500);
    expect(res.seconds).toBe(600);
    expect(res.geometry).not.toBeNull();
    expect(res.geometry![0]![0]).toBeLessThan(116.48);
  });
});

describe('createRegionRoutingClient', () => {
  it('uses amap when both endpoints are in China', async () => {
    const amap = stub(1);
    const ors = stub(2);
    const client = createRegionRoutingClient({ ors: ors.client, amap: amap.client });
    const r = await client.getDrivingDistance({ lat: 39.9, lng: 116.4 }, { lat: 31.2, lng: 121.5 });
    expect(amap.calls()).toBe(1);
    expect(ors.calls()).toBe(0);
    expect(r.meters).toBe(1);
  });

  it('uses ORS when an endpoint is outside China', async () => {
    const amap = stub(1);
    const ors = stub(2);
    const client = createRegionRoutingClient({ ors: ors.client, amap: amap.client });
    const r = await client.getDrivingDistance({ lat: 46.6, lng: 12.3 }, { lat: 31.2, lng: 121.5 });
    expect(ors.calls()).toBe(1);
    expect(amap.calls()).toBe(0);
    expect(r.meters).toBe(2);
  });
});
