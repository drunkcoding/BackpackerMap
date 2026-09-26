import {
  ProviderError,
  type ProviderResult,
  type SearchProvider,
  type SearchQuery,
} from '../types.ts';
import { gcj02ToWgs84 } from '../coords.ts';
import { buildAmapPolygonUrl } from './amap-url.ts';

export interface AmapPoiCache {
  get(key: string): ProviderResult[] | null;
  put(key: string, results: ProviderResult[]): void;
}

export interface AmapProviderOptions {
  apiKey: string;
  fetchJson: (url: string) => Promise<unknown>;
  cache: AmapPoiCache;
  types?: string;
  dailyLimit?: number;
}

interface AmapPoi {
  id?: string;
  name?: string;
  location?: string;
  typecode?: string;
  address?: string;
  tel?: string | string[];
  photos?: Array<{ url?: string }>;
}

interface AmapResponse {
  status?: string;
  info?: string;
  pois?: AmapPoi[];
}

const GRID = 100;

function gridKey(bbox: SearchQuery['bbox'], types: string): string {
  const q = (n: number) => Math.round(n * GRID) / GRID;
  return `amap|${types}|${q(bbox.west)},${q(bbox.south)},${q(bbox.east)},${q(bbox.north)}`;
}

export class AmapProvider implements SearchProvider {
  readonly name = 'amap';
  readonly provider = 'amap' as const;

  private readonly types: string;
  private readonly dailyLimit: number;
  private callDay = '';
  private callCount = 0;

  constructor(private readonly options: AmapProviderOptions) {
    this.types = options.types ?? '100100|100200';
    this.dailyLimit = options.dailyLimit ?? 90;
  }

  private breakerOpen(): boolean {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.callDay) {
      this.callDay = today;
      this.callCount = 0;
    }
    return this.callCount >= this.dailyLimit;
  }

  async search(query: SearchQuery): Promise<ProviderResult[]> {
    const { bbox } = query;
    if (bbox.north === bbox.south && bbox.east === bbox.west) return [];

    const key = gridKey(bbox, this.types);
    const cached = this.options.cache.get(key);
    if (cached) return cached;

    if (this.breakerOpen()) {
      console.warn('[amap] daily quota circuit open; returning no results');
      return [];
    }

    const results: ProviderResult[] = [];
    const maxPages = Math.max(1, Math.ceil(query.maxResults / 25));
    for (let page = 1; page <= maxPages; page++) {
      const url = buildAmapPolygonUrl(bbox, {
        key: this.options.apiKey,
        types: this.types,
        page,
        offset: 25,
      });
      this.callCount++;
      let body: AmapResponse;
      try {
        body = (await this.options.fetchJson(url)) as AmapResponse;
      } catch (err) {
        throw new ProviderError(
          `amap fetch failed: ${err instanceof Error ? err.message : String(err)}`,
          this.name,
          err,
        );
      }
      if (body.status !== '1') {
        throw new ProviderError(`amap error: ${body.info ?? 'unknown'}`, this.name);
      }
      const pois = body.pois ?? [];
      if (pois.length === 0) break;
      for (const p of pois) {
        const loc = typeof p.location === 'string' ? p.location.split(',').map(Number) : null;
        if (!loc || loc.length !== 2 || !p.id || !p.name) continue;
        const [wlng, wlat] = gcj02ToWgs84(loc[0]!, loc[1]!);
        results.push({
          provider: 'amap',
          externalId: p.id,
          name: p.name,
          url: `https://www.amap.com/place/${p.id}`,
          lat: wlat,
          lng: wlng,
          priceLabel: null,
          priceAmount: null,
          currency: null,
          photoUrl: p.photos?.[0]?.url ?? null,
          rating: null,
          reviewCount: null,
          rawJson: JSON.stringify(p),
        });
      }
      if (pois.length < 25) break;
    }

    this.options.cache.put(key, results);
    return results;
  }
}
