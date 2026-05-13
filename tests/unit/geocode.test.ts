import { describe, expect, it, vi } from 'vitest';
import { createNominatimGeocoder } from '../../src/ingest/geocode.ts';

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createNominatimGeocoder', () => {
  it('returns parsed lat/lng for first result', async () => {
    const fetchImpl = vi.fn(async () =>
      okJson([{ lat: '57.1958', lon: '-3.8262', display_name: 'Aviemore' }]),
    );
    const g = createNominatimGeocoder({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
    });
    const r = await g.geocode('Aviemore, Scotland');
    expect(r).toEqual({ lat: 57.1958, lng: -3.8262 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = (fetchImpl.mock.calls as unknown as Array<[string]>)[0]![0];
    expect(url).toContain('q=Aviemore%2C%20Scotland');
  });

  it('returns null on empty result', async () => {
    const fetchImpl = vi.fn(async () => okJson([]));
    const g = createNominatimGeocoder({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
    });
    expect(await g.geocode('nowhere')).toBeNull();
  });

  it('returns null on HTTP error', async () => {
    const fetchImpl = vi.fn(async () => new Response('err', { status: 500 }));
    const g = createNominatimGeocoder({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
    });
    expect(await g.geocode('anywhere')).toBeNull();
  });

  it('enforces minIntervalMs between calls (Nominatim 1 req/sec policy)', async () => {
    const fetchImpl = vi.fn(async () => okJson([{ lat: '1', lon: '2' }]));
    const sleeps: number[] = [];
    let t = 100_000;
    const g = createNominatimGeocoder({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      minIntervalMs: 1100,
      now: () => t,
      sleep: async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
    });
    await g.geocode('one');
    t += 100;
    await g.geocode('two');
    expect(sleeps).toEqual([1000]);
  });

  it('sets User-Agent on requests', async () => {
    const fetchImpl = vi.fn(async () => okJson([{ lat: '1', lon: '2' }]));
    const g = createNominatimGeocoder({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      userAgent: 'TestUA/1.0',
      sleep: async () => {},
    });
    await g.geocode('any');
    const init = (fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>)[0]![1];
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('TestUA/1.0');
  });
});
