import { describe, expect, it, vi } from 'vitest';
import { createPhotonClient, buildPhotonUrl } from '../../src/server/geocode/photon.ts';

function photonFeature(over: Record<string, unknown> = {}) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-3.19, 55.95] },
    properties: {
      osm_type: 'R',
      osm_id: 1234,
      osm_key: 'place',
      osm_value: 'city',
      name: 'Edinburgh',
      country: 'United Kingdom',
      state: 'Scotland',
      extent: [-3.32, 55.99, -3.07, 55.89],
      ...over,
    },
  };
}

function mockFetch(features: ReturnType<typeof photonFeature>[]): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ features }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch;
}

describe('buildPhotonUrl', () => {
  it('encodes q + adds limit + lang + osm_tag filters for place=city/town/region/state/country', () => {
    const url = buildPhotonUrl('edinburgh');
    expect(url).toContain('q=edinburgh');
    expect(url).toContain('limit=8');
    expect(url).toContain('osm_tag=place%3Acity');
    expect(url).toContain('osm_tag=place%3Atown');
    expect(url).toContain('osm_tag=place%3Acountry');
    expect(url).toContain('osm_tag=place:region');
    expect(url).toContain('osm_tag=place:state');
  });
});

describe('PhotonClient.search', () => {
  it('returns empty array for short queries (< 2 chars)', async () => {
    const fetchImpl = mockFetch([]);
    const client = createPhotonClient({ fetchImpl });
    expect(await client.search('')).toEqual([]);
    expect(await client.search('a')).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('normalises a Photon feature into a GeocodeResult', async () => {
    const fetchImpl = mockFetch([photonFeature()]);
    const client = createPhotonClient({ fetchImpl });
    const results = await client.search('edinburgh');
    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.name).toBe('Edinburgh');
    expect(r.label).toContain('Edinburgh');
    expect(r.label).toContain('Scotland');
    expect(r.label).toContain('United Kingdom');
    expect(r.kind).toBe('city');
    expect(r.center.lat).toBeCloseTo(55.95);
    expect(r.center.lng).toBeCloseTo(-3.19);
    expect(r.bbox).not.toBeNull();
    expect(r.bbox!.north).toBeGreaterThan(r.bbox!.south);
    expect(r.bbox!.east).toBeGreaterThan(r.bbox!.west);
    expect(r.osmType).toBe('R');
    expect(r.osmId).toBe(1234);
    expect(r.hasPolygon).toBe(true);
  });

  it('hasPolygon=false for node (N) results', async () => {
    const fetchImpl = mockFetch([photonFeature({ osm_type: 'N' })]);
    const client = createPhotonClient({ fetchImpl });
    const results = await client.search('foo');
    expect(results[0]!.hasPolygon).toBe(false);
    expect(results[0]!.osmType).toBe('N');
  });

  it('drops features with unsupported kinds (e.g. suburb, neighbourhood, village)', async () => {
    const fetchImpl = mockFetch([
      photonFeature({ osm_value: 'suburb' }),
      photonFeature({ osm_value: 'neighbourhood', osm_id: 2 }),
      photonFeature({ osm_value: 'village', osm_id: 3 }),
      photonFeature({ osm_value: 'city', osm_id: 4 }),
    ]);
    const client = createPhotonClient({ fetchImpl });
    const results = await client.search('foo');
    expect(results).toHaveLength(1);
    expect(results[0]!.osmId).toBe(4);
  });

  it('accepts place=town, place=region, place=state (alias of region), place=country', async () => {
    const fetchImpl = mockFetch([
      photonFeature({ osm_value: 'town', osm_id: 11 }),
      photonFeature({ osm_value: 'region', osm_id: 12 }),
      photonFeature({ osm_value: 'state', osm_id: 13 }),
      photonFeature({ osm_value: 'country', osm_id: 14 }),
    ]);
    const client = createPhotonClient({ fetchImpl });
    const results = await client.search('foo');
    expect(results.map((r) => r.kind).sort()).toEqual(['country', 'region', 'region', 'town']);
  });

  it('throws on HTTP error', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('boom', { status: 500 }),
    ) as unknown as typeof fetch;
    const client = createPhotonClient({ fetchImpl });
    await expect(client.search('edinburgh')).rejects.toThrow(/HTTP 500/);
  });

  it('sends User-Agent header', async () => {
    const seen: Array<Record<string, string>> = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.headers) seen.push(init.headers as Record<string, string>);
      return new Response(JSON.stringify({ features: [] }));
    }) as unknown as typeof fetch;
    const client = createPhotonClient({ fetchImpl });
    await client.search('edinburgh');
    expect(seen).toHaveLength(1);
    expect(seen[0]!['User-Agent']).toContain('BackpackerMap');
  });
});
