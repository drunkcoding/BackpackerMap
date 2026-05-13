import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSearch } from '../useSearch';
import { DEFAULT_FILTERS } from '../../lib/searchQuery';

const bbox = { north: 57.2, south: 57.0, east: -3.7, west: -3.9 };

function mockFetchResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('useSearch', () => {
  afterEach(() => vi.restoreAllMocks());

  it('idle when disabled', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(mockFetchResponse({ cached: false, candidates: [], warnings: [] })),
    );
    const { result } = renderHook(() =>
      useSearch({ enabled: false, bbox, filters: DEFAULT_FILTERS }),
    );
    expect(result.current.status).toBe('idle');
  });

  it('debounces then fires fetch with bbox params', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        mockFetchResponse({
          cached: false,
          candidates: [
            {
              id: 1,
              provider: 'airbnb',
              externalId: 'a',
              name: 'A',
              url: '',
              lat: 0,
              lng: 0,
              priceLabel: null,
              priceAmount: null,
              currency: null,
              photoUrl: null,
              rating: null,
              reviewCount: null,
            },
          ],
          warnings: [],
        }),
      ),
    );
    const { result } = renderHook(() =>
      useSearch({ enabled: true, bbox, filters: DEFAULT_FILTERS, debounceMs: 20 }),
    );
    await waitFor(() => expect(result.current.status).toBe('success'), { timeout: 1000 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![0] as string).toContain('north=57.2');
  });
});
