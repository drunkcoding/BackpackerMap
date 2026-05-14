import { describe, expect, it, vi } from 'vitest';
import { createOverpassClient, OverpassError } from '../../src/routing/overpass.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function errResponse(status: number, body = 'error'): Response {
  return new Response(body, { status });
}

describe('Overpass client', () => {
  it('returns the nearest node-type parking', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        elements: [
          { type: 'node', id: 1, lat: 56.30, lon: -4.70 },
          { type: 'node', id: 2, lat: 56.275, lon: -4.716 },
        ],
      }),
    );
    const client = createOverpassClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: () => 0,
    });
    const result = await client.findNearestCarpark({ lat: 56.271, lng: -4.715 }, [1000]);
    expect(result).not.toBeNull();
    expect(result!.point.lat).toBeCloseTo(56.275, 3);
    expect(result!.radiusMeters).toBe(1000);
  });

  it('handles way-type elements using their center', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        elements: [
          { type: 'way', id: 100, center: { lat: 56.272, lon: -4.714 } },
        ],
      }),
    );
    const client = createOverpassClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: () => 0,
    });
    const result = await client.findNearestCarpark({ lat: 56.271, lng: -4.715 }, [1000]);
    expect(result).not.toBeNull();
    expect(result!.point).toEqual({ lat: 56.272, lng: -4.714 });
  });

  it('escalates radius when initial query returns empty', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ elements: [] }))
      .mockResolvedValueOnce(jsonResponse({ elements: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ elements: [{ type: 'node', id: 1, lat: 56.3, lon: -4.7 }] }),
      );
    const client = createOverpassClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: () => 0,
    });
    const result = await client.findNearestCarpark({ lat: 56.271, lng: -4.715 }, [
      1000, 2000, 4000,
    ]);
    expect(result).not.toBeNull();
    expect(result!.radiusMeters).toBe(4000);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('returns null when all radii exhausted without a hit', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ elements: [] }));
    const client = createOverpassClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: () => 0,
    });
    const result = await client.findNearestCarpark({ lat: 56.271, lng: -4.715 }, [1000, 2000]);
    expect(result).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries on 5xx and eventually succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(errResponse(503))
      .mockResolvedValueOnce(
        jsonResponse({ elements: [{ type: 'node', id: 1, lat: 56.3, lon: -4.7 }] }),
      );
    const client = createOverpassClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: () => 0,
    });
    const result = await client.findNearestCarpark({ lat: 56.271, lng: -4.715 }, [1000]);
    expect(result).not.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws OverpassError after max retries on persistent 5xx', async () => {
    const fetchImpl = vi.fn(async () => errResponse(502));
    const client = createOverpassClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: () => 0,
    });
    await expect(
      client.findNearestCarpark({ lat: 56.271, lng: -4.715 }, [1000]),
    ).rejects.toThrow(OverpassError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
