import { describe, expect, it, vi } from 'vitest';
import { createPolygonFetcher } from '../../src/server/geocode/polygon.ts';

function nomResponse(geom: unknown | null) {
  const body = geom
    ? [{ osm_type: 'relation', osm_id: 1234, geojson: geom }]
    : [{ osm_type: 'relation', osm_id: 1234 }];
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('PolygonFetcher.fetchPolygon', () => {
  it('returns the geojson polygon for a valid OSM id', async () => {
    const geom = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
    const fetchImpl = vi.fn(async () => nomResponse(geom)) as unknown as typeof fetch;
    const fetcher = createPolygonFetcher({ fetchImpl });
    const result = await fetcher.fetchPolygon('R', 1234);
    expect(result.geometry).toEqual(geom);
    expect(result.osmType).toBe('R');
    expect(result.osmId).toBe(1234);
  });

  it('returns null geometry when Nominatim has no polygon for the id', async () => {
    const fetchImpl = vi.fn(async () => nomResponse(null)) as unknown as typeof fetch;
    const fetcher = createPolygonFetcher({ fetchImpl });
    const result = await fetcher.fetchPolygon('R', 9999);
    expect(result.geometry).toBeNull();
  });

  it('caches by (osmType, osmId): second identical call does not hit the network', async () => {
    const geom = { type: 'Polygon', coordinates: [] };
    const fetchImpl = vi.fn(async () => nomResponse(geom)) as unknown as typeof fetch;
    const fetcher = createPolygonFetcher({ fetchImpl });
    await fetcher.fetchPolygon('R', 42);
    await fetcher.fetchPolygon('R', 42);
    await fetcher.fetchPolygon('R', 42);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('caches by full key so different OSM ids each fetch once', async () => {
    const geom = { type: 'Polygon', coordinates: [] };
    const fetchImpl = vi.fn(async () => nomResponse(geom)) as unknown as typeof fetch;
    const fetcher = createPolygonFetcher({ fetchImpl });
    await fetcher.fetchPolygon('R', 1);
    await fetcher.fetchPolygon('R', 2);
    await fetcher.fetchPolygon('W', 1);
    await fetcher.fetchPolygon('R', 1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('LRU evicts oldest when cacheSize exceeded', async () => {
    const geom = { type: 'Polygon', coordinates: [] };
    const fetchImpl = vi.fn(async () => nomResponse(geom)) as unknown as typeof fetch;
    const fetcher = createPolygonFetcher({ fetchImpl, cacheSize: 2 });
    await fetcher.fetchPolygon('R', 1);
    await fetcher.fetchPolygon('R', 2);
    await fetcher.fetchPolygon('R', 3);
    await fetcher.fetchPolygon('R', 1);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('throws on HTTP error', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('boom', { status: 500 }),
    ) as unknown as typeof fetch;
    const fetcher = createPolygonFetcher({ fetchImpl });
    await expect(fetcher.fetchPolygon('R', 1)).rejects.toThrow(/HTTP 500/);
  });
});
