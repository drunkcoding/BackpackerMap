import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PyairbnbProvider } from '../../src/search/providers/pyairbnb.ts';
import { ProviderError, type SearchQuery } from '../../src/search/types.ts';

const MOCK = join(process.cwd(), 'scripts', '__mock_pyairbnb_search.py');
const PYTHON_BIN = process.env['PYTHON_BIN'] ?? (process.platform === 'win32' ? 'python' : 'python3');

function makeQuery(over: Partial<SearchQuery> = {}): SearchQuery {
  return {
    bbox: { north: 57.2, south: 57.0, east: -3.7, west: -3.9 },
    zoom: 11,
    checkin: '2026-07-01',
    checkout: '2026-07-07',
    guests: { adults: 2, children: 0, infants: 0 },
    currency: 'GBP',
    maxResults: 5,
    ...over,
  };
}

describe('PyairbnbProvider', () => {
  it('returns typed ProviderResult items from mock Python output', async () => {
    const p = new PyairbnbProvider({
      scriptPath: MOCK,
      pythonBin: PYTHON_BIN,
      timeoutMs: 5_000,
      retries: 0,
    });
    const out = await p.search(makeQuery());
    expect(out).toHaveLength(5);
    expect(out[0]!.provider).toBe('airbnb');
    expect(out[0]!.externalId).toBe('mock-0');
    expect(out[0]!.lat).toBeCloseTo(57.0, 4);
    expect(out[0]!.lng).toBeCloseTo(-3.8, 4);
    expect(out[0]!.priceAmount).toBe(100);
  });

  it('empty bbox returns [] without spawning Python', async () => {
    const p = new PyairbnbProvider({
      scriptPath: MOCK,
      pythonBin: PYTHON_BIN,
      timeoutMs: 5_000,
      retries: 0,
    });
    const out = await p.search(
      makeQuery({ bbox: { north: 0, south: 0, east: 0, west: 0 } }),
    );
    expect(out).toEqual([]);
  });

  it('respects maxResults', async () => {
    const p = new PyairbnbProvider({
      scriptPath: MOCK,
      pythonBin: PYTHON_BIN,
      timeoutMs: 5_000,
      retries: 0,
    });
    const out = await p.search(makeQuery({ maxResults: 2 }));
    expect(out).toHaveLength(2);
  });

  it('Python exit 1 throws ProviderError with stderr', async () => {
    const p = new PyairbnbProvider({
      scriptPath: MOCK,
      pythonBin: PYTHON_BIN,
      timeoutMs: 5_000,
      retries: 0,
      env: { MOCK_PYAIRBNB_SEARCH_BEHAVIOUR: 'fail' },
    });
    await expect(p.search(makeQuery())).rejects.toBeInstanceOf(ProviderError);
  });

  it('empty Python output returns []', async () => {
    const p = new PyairbnbProvider({
      scriptPath: MOCK,
      pythonBin: PYTHON_BIN,
      timeoutMs: 5_000,
      retries: 0,
      env: { MOCK_PYAIRBNB_SEARCH_BEHAVIOUR: 'empty' },
    });
    expect(await p.search(makeQuery())).toEqual([]);
  });

  it('timeout throws ProviderError with /timed out/ message', async () => {
    const p = new PyairbnbProvider({
      scriptPath: MOCK,
      pythonBin: PYTHON_BIN,
      timeoutMs: 100,
      retries: 0,
      env: { MOCK_PYAIRBNB_SEARCH_BEHAVIOUR: 'sleep' },
    });
    await expect(p.search(makeQuery())).rejects.toThrowError(/timed out/);
  }, 10_000);
});
