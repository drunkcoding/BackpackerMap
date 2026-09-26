# Amap + Ctrip (China) Discover Providers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Amap (高德) and Ctrip (携程) as Discover-mode `SearchProvider`s that surface hotels + 民宿 in mainland China as candidate pins.

**Architecture:** Two new providers feed the existing `dispatcher → candidate → /api/search` pipeline. Amap uses the official Web Service POI API (`/v3/place/polygon`); Ctrip uses anonymous Playwright list-scraping + address geocoding. A shared `coords.ts` converts the app's WGS-84 ↔ Amap/Ctrip GCJ-02. A DB migration widens the `source`/`property`/`candidate` `CHECK` constraints and adds an Amap result cache to live within Amap's ~100/day free quota.

**Tech Stack:** Node 20 + TypeScript, better-sqlite3, Playwright, Vitest, React 19 + react-leaflet.

**Spec:** [`docs/superpowers/specs/2026-09-26-amap-ctrip-discover-design.md`](../specs/2026-09-26-amap-ctrip-discover-design.md) · **Issue:** [#1](https://github.com/drunkcoding/BackpackerMap/issues/1)

**Phasing:** Phase 0 (foundation) → Phase 1 (Amap, independently shippable) → Phase 2 (Ctrip) → Phase 3 (web) → Phase 4 (docs). Each phase leaves the app building and testable.

---

## File structure

**New**
- `src/search/coords.ts` — pure GCJ-02 ↔ WGS-84 transforms.
- `src/search/providers/amap-url.ts` — build `/v3/place/polygon` request from a WGS-84 bbox.
- `src/search/providers/amap.ts` — `AmapProvider`.
- `src/search/providers/amap-geocode.ts` — `createAmapGeocoder` (conforms to `Geocoder`).
- `src/search/providers/ctrip-url.ts` — canonical six-param list URL + bbox→cityId.
- `src/search/providers/ctrip.ts` — `CtripProvider`.
- `src/db/migrations/0007_amap_ctrip.sql` — widen CHECKs + `amap_poi_cache` table.
- `web/src/icons/HouseAmap.tsx`, `web/src/icons/HouseCtrip.tsx` — marker icons.
- Tests under `tests/unit/`.

**Modified**
- `src/search/types.ts` — `ProviderName` union.
- `src/db/repo.ts` — `Provider`/`SourceKind` unions; Amap-cache repo fns.
- `src/db/schema.ts` — register migration.
- `src/search/price.ts` — `amap`/`ctrip` passthrough.
- `src/server/server.ts` — env, provider registration, `SEARCH_PROVIDERS` filter.
- `web/src/api.ts` — provider unions.
- `web/src/components/CandidateLayer.tsx` — provider→icon map.
- `web/src/styles/*.css`, `.env.example`, `docs/discover.md`, `docs/data-sources.md`.

---

# Phase 0 — Foundation

## Task 1: Coordinate transform (`coords.ts`)

**Files:**
- Create: `src/search/coords.ts`
- Test: `tests/unit/coords.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/coords.test.ts
import { describe, it, expect } from 'vitest';
import { wgs84ToGcj02, gcj02ToWgs84 } from '../../src/search/coords.ts';

describe('coords', () => {
  it('wgs84ToGcj02 matches reference point (Beijing)', () => {
    const [lng, lat] = wgs84ToGcj02(116.404, 39.915);
    expect(lng).toBeCloseTo(116.41024, 4);
    expect(lat).toBeCloseTo(39.91640, 4);
  });

  it('gcj02ToWgs84 matches reference point (Beijing)', () => {
    const [lng, lat] = gcj02ToWgs84(116.404, 39.915);
    expect(lng).toBeCloseTo(116.39776, 4);
    expect(lat).toBeCloseTo(39.91360, 4);
  });

  it('round-trips within ~1e-5 inside China', () => {
    const [gl, ga] = wgs84ToGcj02(120.15, 30.28);
    const [wl, wa] = gcj02ToWgs84(gl, ga);
    expect(wl).toBeCloseTo(120.15, 5);
    expect(wa).toBeCloseTo(30.28, 5);
  });

  it('is identity outside China (e.g. Dolomites)', () => {
    expect(wgs84ToGcj02(12.3, 46.6)).toEqual([12.3, 46.6]);
    expect(gcj02ToWgs84(12.3, 46.6)).toEqual([12.3, 46.6]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/coords.test.ts`
Expected: FAIL — cannot find module `coords.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// src/search/coords.ts
// GCJ-02 ("Mars") <-> WGS-84 conversion. China basemaps (Amap/Ctrip/Tencent)
// use GCJ-02; this app (OSM/Leaflet/ORS/Nominatim) uses WGS-84.
// Algorithm: the published "eviltransform"/wandergis coordtransform constants.

const PI = Math.PI;
const A = 6378245.0; // Krasovsky 1940 semi-major axis
const EE = 0.00669342162296594323; // eccentricity squared

export type LngLat = [number, number];

function outOfChina(lng: number, lat: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(lng: number, lat: number): number {
  let ret =
    -100 + 2 * lng + 3 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
  ret += ((20 * Math.sin(6 * lng * PI) + 20 * Math.sin(2 * lng * PI)) * 2) / 3;
  ret += ((20 * Math.sin(lat * PI) + 40 * Math.sin((lat / 3) * PI)) * 2) / 3;
  ret += ((160 * Math.sin((lat / 12) * PI) + 320 * Math.sin((lat * PI) / 30)) * 2) / 3;
  return ret;
}

function transformLng(lng: number, lat: number): number {
  let ret = 300 + lng + 2 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
  ret += ((20 * Math.sin(6 * lng * PI) + 20 * Math.sin(2 * lng * PI)) * 2) / 3;
  ret += ((20 * Math.sin(lng * PI) + 40 * Math.sin((lng / 3) * PI)) * 2) / 3;
  ret += ((150 * Math.sin((lng / 12) * PI) + 300 * Math.sin((lng / 30) * PI)) * 2) / 3;
  return ret;
}

function delta(lng: number, lat: number): LngLat {
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return [dLng, dLat];
}

export function wgs84ToGcj02(lng: number, lat: number): LngLat {
  if (outOfChina(lng, lat)) return [lng, lat];
  const [dLng, dLat] = delta(lng, lat);
  return [lng + dLng, lat + dLat];
}

export function gcj02ToWgs84(lng: number, lat: number): LngLat {
  if (outOfChina(lng, lat)) return [lng, lat];
  const [dLng, dLat] = delta(lng, lat);
  return [lng - dLng, lat - dLat];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/coords.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/search/coords.ts tests/unit/coords.test.ts
git commit -m "feat(search): add GCJ-02<->WGS-84 coordinate transforms"
```

---

## Task 2: Widen provider/source type unions

**Files:**
- Modify: `src/search/types.ts:1`
- Modify: `src/db/repo.ts:7-8`
- Modify: `src/search/price.ts:52-57`
- Modify: `src/server/server.ts:30`

- [ ] **Step 1: Widen `ProviderName`**

In `src/search/types.ts`, line 1:
```ts
export type ProviderName = 'airbnb' | 'booking' | 'amap' | 'ctrip';
```

- [ ] **Step 2: Widen repo unions**

In `src/db/repo.ts`, lines 7-8:
```ts
export type SourceKind = 'alltrails' | 'airbnb' | 'booking' | 'google_maps' | 'amap' | 'ctrip';
export type Provider = 'airbnb' | 'booking' | 'amap' | 'ctrip';
```

- [ ] **Step 3: Make `normalizePriceToTotal` accept the new providers**

In `src/search/price.ts`, change the signature (line 53) and add an early passthrough at the top of the body (after line 58's `nights`):
```ts
export function normalizePriceToTotal(
  provider: 'airbnb' | 'booking' | 'amap' | 'ctrip',
  raw: RawPrice,
  checkin: string | null,
  checkout: string | null,
): NormalizedPrice {
  // Amap POIs carry no price; Ctrip prices are already display labels we keep verbatim.
  if (provider === 'amap' || provider === 'ctrip') return raw;
  const nights = nightsBetween(checkin, checkout);
  // ...existing airbnb/booking logic unchanged...
```

- [ ] **Step 4: Widen the `SEARCH_PROVIDERS` filter**

In `src/server/server.ts`, lines 27-30:
```ts
const enabledProviders = (process.env['SEARCH_PROVIDERS'] ?? 'airbnb,booking')
  .split(',')
  .map((s) => s.trim())
  .filter((s): s is ProviderName => s === 'airbnb' || s === 'booking' || s === 'amap' || s === 'ctrip');
```

- [ ] **Step 5: Verify typecheck passes**

Run: `npm run typecheck`
Expected: exit 0 (no type errors from the union widening).

- [ ] **Step 6: Commit**

```bash
git add src/search/types.ts src/db/repo.ts src/search/price.ts src/server/server.ts
git commit -m "feat(search): widen provider/source unions for amap + ctrip"
```

---

## Task 3: Migration — widen CHECKs + Amap cache table

**Files:**
- Create: `src/db/migrations/0007_amap_ctrip.sql`
- Modify: `src/db/schema.ts:8-15`
- Test: `tests/integration/migration-0007.test.ts`

> The migration runner ([`schema.ts`](../../../src/db/schema.ts)) turns `foreign_keys` OFF around the file and asserts `PRAGMA foreign_key_check` is empty afterward, so table rebuilds are safe. Rebuild order is candidate → source → property (property's FKs reference both). All `id`s are preserved so `route_cache`/`candidate_route_cache` rows stay valid.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/migration-0007.test.ts
import { describe, it, expect } from 'vitest';
import { openDb, createSource, upsertCandidate } from '../../src/db/repo.ts';

describe('migration 0007', () => {
  it('allows amap + ctrip source kinds and candidate providers', () => {
    const db = openDb(':memory:');
    expect(() => createSource(db, 'amap')).not.toThrow();
    expect(() => createSource(db, 'ctrip')).not.toThrow();
    const c = upsertCandidate(db, {
      provider: 'amap', externalId: 'B0FFABC123', name: '杭州西湖民宿', url: 'https://amap.com',
      lat: 30.24, lng: 120.15, priceLabel: null, priceAmount: null, currency: null,
      photoUrl: null, rating: null, reviewCount: null, rawJson: '{}',
    });
    expect(c.id).toBeGreaterThan(0);
    db.close();
  });

  it('creates amap_poi_cache', () => {
    const db = openDb(':memory:');
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='amap_poi_cache'",
    ).get();
    expect(row).toBeTruthy();
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/migration-0007.test.ts`
Expected: FAIL — `createSource(db,'amap')` throws a CHECK constraint error (and `amap_poi_cache` missing).

- [ ] **Step 3: Write the migration**

```sql
-- src/db/migrations/0007_amap_ctrip.sql
-- Widen provider/kind CHECK constraints for the China Discover providers, and add
-- a long-TTL Amap POI result cache (Amap free quota is ~100 polygon calls/day).
-- Rebuild order: candidate -> source -> property. foreign_keys is OFF (runner);
-- ids are preserved so route_cache / candidate_route_cache stay valid.

-- 1) candidate
CREATE TABLE candidate_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  provider        TEXT NOT NULL CHECK (provider IN ('airbnb','booking','amap','ctrip')),
  external_id     TEXT NOT NULL,
  name            TEXT NOT NULL,
  url             TEXT NOT NULL,
  lat             REAL NOT NULL,
  lng             REAL NOT NULL,
  price_label     TEXT,
  price_amount    REAL,
  currency        TEXT,
  photo_url       TEXT,
  rating          REAL,
  review_count    INTEGER,
  raw_json        TEXT NOT NULL,
  first_seen_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider, external_id)
);
INSERT INTO candidate_new
  SELECT id, provider, external_id, name, url, lat, lng, price_label, price_amount,
         currency, photo_url, rating, review_count, raw_json, first_seen_at, last_seen_at
  FROM candidate;
DROP TABLE candidate;
ALTER TABLE candidate_new RENAME TO candidate;
CREATE INDEX idx_candidate_geo ON candidate(lat, lng);

-- 2) source
CREATE TABLE source_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL CHECK (kind IN ('alltrails','airbnb','booking','google_maps','amap','ctrip')),
  ingested_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO source_new (id, kind, ingested_at) SELECT id, kind, ingested_at FROM source;
DROP TABLE source;
ALTER TABLE source_new RENAME TO source;

-- 3) property (FKs -> source, candidate)
CREATE TABLE property_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id     INTEGER NOT NULL REFERENCES source(id),
  provider      TEXT NOT NULL CHECK (provider IN ('airbnb','booking','amap','ctrip')),
  external_id   TEXT NOT NULL,
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  lat           REAL,
  lng           REAL,
  price_label   TEXT,
  photo_url     TEXT,
  raw_json      TEXT NOT NULL,
  enriched_at   TEXT,
  promoted_from_candidate_id INTEGER REFERENCES candidate(id) ON DELETE SET NULL,
  UNIQUE (provider, external_id)
);
INSERT INTO property_new
  SELECT id, source_id, provider, external_id, name, url, lat, lng, price_label,
         photo_url, raw_json, enriched_at, promoted_from_candidate_id
  FROM property;
DROP TABLE property;
ALTER TABLE property_new RENAME TO property;
CREATE INDEX idx_property_geo ON property(lat, lng);

-- 4) Amap POI result cache (raw ProviderResult[] JSON keyed by grid-snapped bbox+types)
CREATE TABLE amap_poi_cache (
  cache_key    TEXT PRIMARY KEY,
  results_json TEXT NOT NULL,
  fetched_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_amap_poi_cache_fetched ON amap_poi_cache(fetched_at);
```

- [ ] **Step 4: Register the migration**

In `src/db/schema.ts`, add to the `MIGRATIONS` array (after line 14):
```ts
  '0006_candidate_route_cache.sql',
  '0007_amap_ctrip.sql',
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/integration/migration-0007.test.ts`
Expected: PASS (2 tests). Also run `npx vitest run tests/integration` to confirm no existing migration test regressed.

- [ ] **Step 6: Commit**

```bash
git add src/db/migrations/0007_amap_ctrip.sql src/db/schema.ts tests/integration/migration-0007.test.ts
git commit -m "feat(db): migration 0007 - widen provider CHECKs + amap_poi_cache"
```

---

# Phase 1 — Amap provider (independently shippable)

## Task 4: Amap request builder (`amap-url.ts`)

**Files:**
- Create: `src/search/providers/amap-url.ts`
- Test: `tests/unit/amap-url.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/amap-url.test.ts
import { describe, it, expect } from 'vitest';
import { buildAmapPolygonUrl } from '../../src/search/providers/amap-url.ts';

describe('buildAmapPolygonUrl', () => {
  it('converts a WGS-84 bbox to a GCJ-02 top-left|bottom-right polygon', () => {
    const url = new URL(
      buildAmapPolygonUrl(
        { north: 30.3, south: 30.2, east: 120.2, west: 120.1 },
        { key: 'K', types: '100100|100200', page: 1, offset: 25 },
      ),
    );
    expect(url.origin + url.pathname).toBe('https://restapi.amap.com/v3/place/polygon');
    expect(url.searchParams.get('key')).toBe('K');
    expect(url.searchParams.get('types')).toBe('100100|100200');
    expect(url.searchParams.get('offset')).toBe('25');
    expect(url.searchParams.get('page')).toBe('1');
    // polygon = "tlLng,tlLat|brLng,brLat" (top-left = west,north; bottom-right = east,south)
    const poly = url.searchParams.get('polygon')!;
    const [tl, br] = poly.split('|');
    const [tlLng, tlLat] = tl!.split(',').map(Number);
    const [brLng, brLat] = br!.split(',').map(Number);
    expect(tlLng).toBeCloseTo(120.1, 2); // GCJ shift is small at this precision
    expect(tlLat).toBeGreaterThan(brLat); // north above south
    expect(brLng).toBeGreaterThan(tlLng); // east right of west
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/amap-url.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/search/providers/amap-url.ts
import { wgs84ToGcj02 } from '../coords.ts';
import type { BBox } from '../types.ts';

export interface AmapPolygonParams {
  key: string;
  types: string;
  page: number;
  offset: number;
}

const ENDPOINT = 'https://restapi.amap.com/v3/place/polygon';

export function buildAmapPolygonUrl(bbox: BBox, params: AmapPolygonParams): string {
  // Amap expects GCJ-02. Rectangle = top-left (west,north) | bottom-right (east,south).
  const [tlLng, tlLat] = wgs84ToGcj02(bbox.west, bbox.north);
  const [brLng, brLat] = wgs84ToGcj02(bbox.east, bbox.south);
  const polygon = `${tlLng.toFixed(6)},${tlLat.toFixed(6)}|${brLng.toFixed(6)},${brLat.toFixed(6)}`;
  const u = new URL(ENDPOINT);
  u.searchParams.set('key', params.key);
  u.searchParams.set('polygon', polygon);
  u.searchParams.set('types', params.types);
  u.searchParams.set('offset', String(params.offset));
  u.searchParams.set('page', String(params.page));
  u.searchParams.set('extensions', 'base');
  return u.toString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/amap-url.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/search/providers/amap-url.ts tests/unit/amap-url.test.ts
git commit -m "feat(search): amap polygon URL builder (bbox->GCJ-02)"
```

---

## Task 5: Amap provider (`amap.ts`)

**Files:**
- Create: `src/search/providers/amap.ts`
- Test: `tests/unit/amap-provider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/amap-provider.test.ts
import { describe, it, expect } from 'vitest';
import { AmapProvider } from '../../src/search/providers/amap.ts';
import type { SearchQuery } from '../../src/search/types.ts';

const query: SearchQuery = {
  bbox: { north: 30.3, south: 30.2, east: 120.2, west: 120.1 },
  zoom: 13, checkin: null, checkout: null,
  guests: { adults: 2, children: 0, infants: 0 }, currency: 'CNY', maxResults: 25,
};

function fakeAmapResponse() {
  return {
    status: '1',
    pois: [
      { id: 'B0FFABC', name: '西湖民宿', location: '120.150000,30.250000',
        typecode: '100200', address: '龙井路1号', tel: '', photos: [{ url: 'http://p/1.jpg' }] },
    ],
  };
}

describe('AmapProvider', () => {
  it('maps POIs and converts GCJ-02 -> WGS-84', async () => {
    const provider = new AmapProvider({
      apiKey: 'K',
      fetchJson: async () => fakeAmapResponse(),
      cache: { get: () => null, put: () => {} },
    });
    const results = await provider.search(query);
    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.provider).toBe('amap');
    expect(r.externalId).toBe('B0FFABC');
    // GCJ 120.15,30.25 -> WGS is slightly west/south of the input
    expect(r.lng).toBeLessThan(120.15);
    expect(r.lat).toBeLessThan(30.25);
    expect(r.photoUrl).toBe('http://p/1.jpg');
  });

  it('returns [] when the circuit breaker is open', async () => {
    let calls = 0;
    const provider = new AmapProvider({
      apiKey: 'K',
      fetchJson: async () => { calls++; return fakeAmapResponse(); },
      cache: { get: () => null, put: () => {} },
      dailyLimit: 0, // breaker open immediately
    });
    const results = await provider.search(query);
    expect(results).toEqual([]);
    expect(calls).toBe(0);
  });

  it('serves from cache without calling the API', async () => {
    let calls = 0;
    const cached = [{ provider: 'amap', externalId: 'X', name: 'n', url: 'u',
      lat: 30, lng: 120, priceLabel: null, priceAmount: null, currency: null,
      photoUrl: null, rating: null, reviewCount: null, rawJson: '{}' }];
    const provider = new AmapProvider({
      apiKey: 'K',
      fetchJson: async () => { calls++; return fakeAmapResponse(); },
      cache: { get: () => cached, put: () => {} },
    });
    const results = await provider.search(query);
    expect(calls).toBe(0);
    expect(results[0]!.externalId).toBe('X');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/amap-provider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/search/providers/amap.ts
import { ProviderError, type ProviderResult, type SearchProvider, type SearchQuery } from '../types.ts';
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
  location?: string; // "lng,lat" in GCJ-02
  typecode?: string;
  address?: string;
  tel?: string | string[];
  photos?: Array<{ url?: string }>;
}
interface AmapResponse { status?: string; info?: string; pois?: AmapPoi[] }

const GRID = 100; // ~0.01deg (~1km) cache grid
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
    this.dailyLimit = options.dailyLimit ?? 90; // headroom under the ~100/day free cap
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
      const url = buildAmapPolygonUrl(bbox, { key: this.options.apiKey, types: this.types, page, offset: 25 });
      this.callCount++;
      let body: AmapResponse;
      try {
        body = (await this.options.fetchJson(url)) as AmapResponse;
      } catch (err) {
        throw new ProviderError(`amap fetch failed: ${err instanceof Error ? err.message : String(err)}`, this.name, err);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/amap-provider.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/search/providers/amap.ts tests/unit/amap-provider.test.ts
git commit -m "feat(search): AmapProvider with GCJ-02 conversion, cache + circuit breaker"
```

---

## Task 6: Amap cache repo functions

**Files:**
- Modify: `src/db/repo.ts` (append near the search-cache helpers, ~line 698)
- Test: `tests/unit/amap-cache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/amap-cache.test.ts
import { describe, it, expect } from 'vitest';
import { openDb, getAmapPoiCache, putAmapPoiCache } from '../../src/db/repo.ts';

describe('amap_poi_cache repo', () => {
  it('round-trips results and respects TTL', () => {
    const db = openDb(':memory:');
    const results = [{ provider: 'amap', externalId: 'A', name: 'n', url: 'u',
      lat: 30, lng: 120, priceLabel: null, priceAmount: null, currency: null,
      photoUrl: null, rating: null, reviewCount: null, rawJson: '{}' }];
    putAmapPoiCache(db, 'k1', results);
    expect(getAmapPoiCache(db, 'k1', 60_000)).toEqual(results);
    expect(getAmapPoiCache(db, 'k1', -1)).toBeNull(); // expired
    expect(getAmapPoiCache(db, 'missing', 60_000)).toBeNull();
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/amap-cache.test.ts`
Expected: FAIL — `getAmapPoiCache` not exported.

- [ ] **Step 3: Write the implementation**

Add the import to the **existing top import block** of `src/db/repo.ts`:
```ts
import type { ProviderResult } from '../search/types.ts';
```
Then **append the interface + functions at the end of the file**:
```ts
interface AmapPoiCacheRow {
  cache_key: string;
  results_json: string;
  fetched_at: string;
}

export function getAmapPoiCache(
  db: DatabaseType,
  cacheKey: string,
  maxAgeMs: number,
): ProviderResult[] | null {
  const row = db
    .prepare<[string], AmapPoiCacheRow>('SELECT * FROM amap_poi_cache WHERE cache_key = ?')
    .get(cacheKey);
  if (!row) return null;
  const ageMs = Date.now() - new Date(row.fetched_at + 'Z').getTime();
  if (ageMs > maxAgeMs) return null;
  return JSON.parse(row.results_json) as ProviderResult[];
}

export function putAmapPoiCache(
  db: DatabaseType,
  cacheKey: string,
  results: ProviderResult[],
): void {
  db.prepare(
    `INSERT INTO amap_poi_cache (cache_key, results_json)
     VALUES (?, ?)
     ON CONFLICT (cache_key) DO UPDATE SET
       results_json = excluded.results_json,
       fetched_at = datetime('now')`,
  ).run(cacheKey, JSON.stringify(results));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/amap-cache.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/repo.ts tests/unit/amap-cache.test.ts
git commit -m "feat(db): amap_poi_cache repo helpers"
```

---

## Task 7: Amap geocoder (`amap-geocode.ts`)

**Files:**
- Create: `src/search/providers/amap-geocode.ts`
- Test: `tests/unit/amap-geocode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/amap-geocode.test.ts
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
    expect(r!.lng).toBeLessThan(120.15); // GCJ->WGS shift applied
    expect(r!.lat).toBeLessThan(30.25);
  });

  it('returns null on no match', async () => {
    const geo = createAmapGeocoder({
      apiKey: 'K',
      fetchJson: async () => ({ status: '1', geocodes: [] }),
    });
    expect(await geo.geocode('nowhere')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/amap-geocode.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/search/providers/amap-geocode.ts
import type { Geocoder, NominatimResult } from '../../ingest/geocode.ts';
import { gcj02ToWgs84 } from '../coords.ts';

export interface AmapGeocoderDeps {
  apiKey: string;
  fetchJson: (url: string) => Promise<unknown>;
}

interface AmapGeocodeResponse {
  status?: string;
  geocodes?: Array<{ location?: string }>; // "lng,lat" GCJ-02
}

const ENDPOINT = 'https://restapi.amap.com/v3/geocode/geo';

export function createAmapGeocoder(deps: AmapGeocoderDeps): Geocoder {
  async function geocode(address: string): Promise<NominatimResult | null> {
    if (!address.trim()) return null;
    const u = new URL(ENDPOINT);
    u.searchParams.set('key', deps.apiKey);
    u.searchParams.set('address', address);
    const body = (await deps.fetchJson(u.toString())) as AmapGeocodeResponse;
    if (body.status !== '1') return null;
    const loc = body.geocodes?.[0]?.location;
    if (!loc) return null;
    const [glng, glat] = loc.split(',').map(Number);
    if (!Number.isFinite(glng) || !Number.isFinite(glat)) return null;
    const [lng, lat] = gcj02ToWgs84(glng!, glat!);
    return { lat, lng };
  }
  return { geocode };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/amap-geocode.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/search/providers/amap-geocode.ts tests/unit/amap-geocode.test.ts
git commit -m "feat(search): Amap geocoder (Geocoder-compatible, GCJ-02->WGS-84)"
```

---

## Task 8: Wire Amap into the server

**Files:**
- Modify: `src/server/server.ts` (imports + env + registration)
- Modify: `.env.example`

- [ ] **Step 1: Add imports + env + registration**

In `src/server/server.ts`:
```ts
// with the other provider imports (~line 11)
import { AmapProvider } from '../search/providers/amap.ts';
import { getAmapPoiCache, putAmapPoiCache } from '../db/repo.ts';

// near the ORS key (~line 18)
const amapKey = process.env['AMAP_KEY'] ?? '';

// after the booking provider push (~line 135), guarded so it only registers when configured
if (amapKey) {
  const amapCacheTtlMs = 30 * 24 * 60 * 60 * 1000; // 30 days: POIs are stable
  allProviders.push(
    new AmapProvider({
      apiKey: amapKey,
      fetchJson: async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      },
      cache: {
        get: (k) => getAmapPoiCache(db, k, amapCacheTtlMs),
        put: (k, results) => putAmapPoiCache(db, k, results),
      },
    }),
  );
} else if (enabledProviders.includes('amap')) {
  console.warn('[server] SEARCH_PROVIDERS includes amap but AMAP_KEY is unset; amap disabled');
}
```

- [ ] **Step 2: Document the env var**

Append to `.env.example`:
```bash
# Amap (高德) Web Service key for China Discover POI search (real-name-verified key).
# Free individual quota is ~100 polygon-search calls/day; results are cached 30 days.
AMAP_KEY=
# To enable the China providers in Discover:
# SEARCH_PROVIDERS=airbnb,booking,amap,ctrip
```

- [ ] **Step 3: Verify build + full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: exit 0; all tests pass.

- [ ] **Step 4: Manual smoke (real key)**

With a real key: `AMAP_KEY=<key> SEARCH_PROVIDERS=amap npm run dev`, then:
`curl 'http://localhost:3000/api/search?north=30.30&south=30.20&east=120.20&west=120.10&currency=CNY'`
Expected: JSON with `candidates` carrying WGS-84 lat/lng inside the bbox. Verify a returned pin lands on the correct spot on the map (not offset ~500 m).

- [ ] **Step 5: Commit**

```bash
git add src/server/server.ts .env.example
git commit -m "feat(server): register AmapProvider behind AMAP_KEY"
```

---

# Phase 2 — Ctrip provider

## Task 9: Ctrip URL builder (`ctrip-url.ts`)

**Files:**
- Create: `src/search/providers/ctrip-url.ts`
- Test: `tests/unit/ctrip-url.test.ts`

> Ctrip's list page requires the **canonical six-param URL** or it redirects to login. `cityId` is required; we resolve it from the bbox centre via a small static table of major China cities (extend as needed; unknown → nearest by centroid).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/ctrip-url.test.ts
import { describe, it, expect } from 'vitest';
import { bboxToCityId, buildCtripListUrl } from '../../src/search/providers/ctrip-url.ts';
import type { SearchQuery } from '../../src/search/types.ts';

const q: SearchQuery = {
  bbox: { north: 30.35, south: 30.15, east: 120.25, west: 120.05 }, // Hangzhou
  zoom: 12, checkin: '2026-10-01', checkout: '2026-10-02',
  guests: { adults: 2, children: 0, infants: 0 }, currency: 'CNY', maxResults: 25,
};

describe('ctrip-url', () => {
  it('maps a bbox centre to the nearest known cityId', () => {
    expect(bboxToCityId(q.bbox)).toBe(17); // Hangzhou
  });
  it('builds the canonical six-param URL', () => {
    const url = new URL(buildCtripListUrl(q));
    expect(url.origin + url.pathname).toBe('https://hotels.ctrip.com/hotels/list');
    expect(url.searchParams.get('flexType')).toBe('1');
    expect(url.searchParams.get('cityId')).toBe('17');
    expect(url.searchParams.get('provinceId')).toBe('0');
    expect(url.searchParams.get('districtId')).toBe('0');
    expect(url.searchParams.get('countryId')).toBe('1');
    expect(url.searchParams.get('checkin')).toBe('2026-10-01');
    expect(url.searchParams.get('checkout')).toBe('2026-10-02');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ctrip-url.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/search/providers/ctrip-url.ts
import type { BBox, SearchQuery } from '../types.ts';

// Minimal seed table of Ctrip cityIds (extend as coverage grows). lat/lng = city centre (WGS-84).
const CITY_TABLE: Array<{ cityId: number; lat: number; lng: number }> = [
  { cityId: 1, lat: 39.9042, lng: 116.4074 }, // Beijing
  { cityId: 2, lat: 31.2304, lng: 121.4737 }, // Shanghai
  { cityId: 17, lat: 30.2741, lng: 120.1551 }, // Hangzhou
  { cityId: 28, lat: 34.3416, lng: 108.9398 }, // Xi'an
  { cityId: 32, lat: 23.1291, lng: 113.2644 }, // Guangzhou
  { cityId: 43, lat: 18.2528, lng: 109.5119 }, // Sanya
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
    if (d < bestD) { bestD = d; best = c; }
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/ctrip-url.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/search/providers/ctrip-url.ts tests/unit/ctrip-url.test.ts
git commit -m "feat(search): Ctrip canonical list-URL builder + bbox->cityId"
```

---

## Task 10: Ctrip provider (`ctrip.ts`)

**Files:**
- Create: `src/search/providers/ctrip.ts`
- Test: `tests/unit/ctrip-provider.test.ts`
- Fixture: `tests/fixtures/ctrip-list.html`

> **Verification-first (spec risk #1):** before implementing, capture a live list page and confirm the `window.IBU_HOTEL` shape. If the field paths differ from below, adjust `parseCtripListHtml` and the fixture together.

- [ ] **Step 1: Capture a live fixture + confirm structure**

Run (real network):
```bash
node -e "import('playwright').then(async ({chromium})=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('https://hotels.ctrip.com/hotels/list?flexType=1&cityId=17&provinceId=0&districtId=0&countryId=1&checkin=2026-10-01&checkout=2026-10-02',{waitUntil:'networkidle'});const h=await p.content();require('fs').writeFileSync('tests/fixtures/ctrip-list.html',h);await b.close();console.log('bytes',h.length);})"
```
Confirm the HTML contains `window.IBU_HOTEL` and a `initData.firstPageList.hotelList.list[]` with `base.hotelName` + `position.address`. If not present / redirected to `passport.ctrip.com`, record the actual shape and adjust Steps 3-4.

- [ ] **Step 2: Write the failing test (against the fixture)**

```ts
// tests/unit/ctrip-provider.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CtripProvider, parseCtripListHtml } from '../../src/search/providers/ctrip.ts';
import type { SearchQuery } from '../../src/search/types.ts';

const html = readFileSync('tests/fixtures/ctrip-list.html', 'utf8');
const q: SearchQuery = {
  bbox: { north: 30.35, south: 30.15, east: 120.25, west: 120.05 },
  zoom: 12, checkin: '2026-10-01', checkout: '2026-10-02',
  guests: { adults: 2, children: 0, infants: 0 }, currency: 'CNY', maxResults: 10,
};

describe('CtripProvider', () => {
  it('parses hotel cards (name + address) from the list HTML', () => {
    const cards = parseCtripListHtml(html);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0]!.name).toBeTruthy();
    expect(cards[0]!.address).toBeTruthy();
  });

  it('detects the login redirect as a failure', async () => {
    const provider = new CtripProvider({
      fetchHtml: async () => '<html><body>redirected</body></html>',
      geocoder: { geocode: async () => ({ lat: 30.25, lng: 120.15 }) },
    });
    // A page with no IBU_HOTEL and a passport URL should yield [] or throw; assert no crash.
    await expect(provider.search(q)).resolves.toBeDefined();
  });

  it('geocodes addresses to WGS-84 candidates', async () => {
    const provider = new CtripProvider({
      fetchHtml: async () => html,
      geocoder: { geocode: async () => ({ lat: 30.25, lng: 120.15 }) },
    });
    const results = await provider.search(q);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.provider).toBe('ctrip');
    expect(results[0]!.lat).toBeCloseTo(30.25, 5);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/ctrip-provider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

```ts
// src/search/providers/ctrip.ts
import { createHash } from 'node:crypto';
import { ProviderError, type ProviderResult, type SearchProvider, type SearchQuery } from '../types.ts';
import type { Geocoder } from '../../ingest/geocode.ts';
import { buildCtripListUrl } from './ctrip-url.ts';

export interface CtripCard { name: string; address: string; priceLabel: string | null; }
export interface CtripProviderOptions {
  fetchHtml: (url: string) => Promise<string>;
  geocoder: Geocoder;
  maxGeocodes?: number;
}

// Extracts the JSON assigned to `window.IBU_HOTEL = {...};` and walks to the hotel list.
export function parseCtripListHtml(html: string): CtripCard[] {
  const m = html.match(/window\.IBU_HOTEL\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (!m) return [];
  let data: unknown;
  try { data = JSON.parse(m[1]!); } catch { return []; }
  const list = (data as any)?.initData?.firstPageList?.hotelList?.list;
  if (!Array.isArray(list)) return [];
  const cards: CtripCard[] = [];
  for (const it of list) {
    const name = it?.base?.hotelName ?? it?.base?.hotelEnName;
    const address = it?.position?.address ?? it?.position?.cityName;
    if (!name || !address) continue;
    const priceLabel = it?.ctripTrace?.listPrice_cx != null ? `¥${it.ctripTrace.listPrice_cx}` : null;
    cards.push({ name: String(name), address: String(address), priceLabel });
  }
  return cards;
}

function stableId(name: string, address: string): string {
  return createHash('sha1').update(`${name}|${address}`).digest('hex').slice(0, 16);
}

export class CtripProvider implements SearchProvider {
  readonly name = 'ctrip';
  readonly provider = 'ctrip' as const;

  constructor(private readonly options: CtripProviderOptions) {}

  async search(query: SearchQuery): Promise<ProviderResult[]> {
    const url = buildCtripListUrl(query);
    let html: string;
    try {
      html = await this.options.fetchHtml(url);
    } catch (err) {
      throw new ProviderError(`ctrip fetch failed: ${err instanceof Error ? err.message : String(err)}`, this.name, err);
    }
    if (/passport\.ctrip\.com/.test(html)) {
      throw new ProviderError('ctrip redirected to login (anti-bot gate)', this.name);
    }

    const cards = parseCtripListHtml(html).slice(0, this.options.maxGeocodes ?? query.maxResults);
    const results: ProviderResult[] = [];
    for (const card of cards) {
      const geo = await this.options.geocoder.geocode(`${card.address} ${card.name}`);
      if (!geo) continue; // candidate table requires coords
      results.push({
        provider: 'ctrip',
        externalId: stableId(card.name, card.address),
        name: card.name,
        url,
        lat: geo.lat,
        lng: geo.lng,
        priceLabel: card.priceLabel,
        priceAmount: null,
        currency: null,
        photoUrl: null,
        rating: null,
        reviewCount: null,
        rawJson: JSON.stringify(card),
      });
    }
    return results;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/ctrip-provider.test.ts`
Expected: PASS. If Step 1 revealed a different `IBU_HOTEL` shape, the fixture + `parseCtripListHtml` must agree — fix both, re-run.

- [ ] **Step 6: Commit**

```bash
git add src/search/providers/ctrip.ts tests/unit/ctrip-provider.test.ts tests/fixtures/ctrip-list.html
git commit -m "feat(search): CtripProvider (list scrape + geocode)"
```

---

## Task 11: Wire Ctrip into the server

**Files:**
- Modify: `src/server/server.ts`

> Ctrip reuses the shared Playwright `fetchHtml` closure already built for Booking (`bookingFetchOnce` + retry). Its geocoder is the Amap geocoder (accurate for Chinese addresses) with a Nominatim fallback.

- [ ] **Step 1: Add imports + registration**

In `src/server/server.ts`:
```ts
import { CtripProvider } from '../search/providers/ctrip.ts';
import { createAmapGeocoder } from '../search/providers/amap-geocode.ts';
import { createNominatimGeocoder, type Geocoder } from '../ingest/geocode.ts';

// after the Amap block:
const chinaFetchJson = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};
const nominatim = createNominatimGeocoder();
const ctripGeocoder: Geocoder = amapKey
  ? {
      geocode: async (addr) =>
        (await createAmapGeocoder({ apiKey: amapKey, fetchJson: chinaFetchJson }).geocode(addr)) ??
        (await nominatim.geocode(addr)),
    }
  : nominatim;

allProviders.push(
  new CtripProvider({
    fetchHtml: async (url) => {
      try {
        return await bookingFetchOnce(url);
      } catch (err) {
        if (!isContextClosedError(err)) throw err;
        bookingContext = null;
        return await bookingFetchOnce(url);
      }
    },
    geocoder: ctripGeocoder,
  }),
);
```

- [ ] **Step 2: Verify build + suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: exit 0; all pass.

- [ ] **Step 3: Manual smoke**

`SEARCH_PROVIDERS=ctrip AMAP_KEY=<key> npm run dev`, then
`curl 'http://localhost:3000/api/search?north=30.35&south=30.15&east=120.25&west=120.05&currency=CNY&checkin=2026-10-01&checkout=2026-10-02'`
Expected: `candidates` with `provider:"ctrip"` and plausible Hangzhou coords, or a `warnings` entry if Ctrip's anti-bot blocked the fetch (graceful).

- [ ] **Step 4: Commit**

```bash
git add src/server/server.ts
git commit -m "feat(server): register CtripProvider (shared browser + Amap/Nominatim geocode)"
```

---

# Phase 3 — Web

## Task 12: Provider unions + candidate markers

**Files:**
- Modify: `web/src/api.ts:2,57`
- Create: `web/src/icons/HouseAmap.tsx`, `web/src/icons/HouseCtrip.tsx`
- Modify: `web/src/components/CandidateLayer.tsx:9-13,58`
- Modify: `web/src/styles/globals.css` (marker colours)

- [ ] **Step 1: Widen the web provider unions**

In `web/src/api.ts`, change both occurrences (line 2 `ApiProperty.provider`, line 57 `ApiCandidate.provider`):
```ts
  provider: 'airbnb' | 'booking' | 'amap' | 'ctrip';
```

- [ ] **Step 2: Add marker icons**

`web/src/icons/HouseAmap.tsx` and `web/src/icons/HouseCtrip.tsx` — copy the structure of `web/src/icons/HouseBooking.tsx`, changing only the `fill`/accent so each source is visually distinct (e.g. Amap teal, Ctrip blue). Example:
```tsx
// web/src/icons/HouseAmap.tsx
export function HouseAmap() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M12 3 2 11h3v8h6v-5h2v5h6v-8h3z" fill="#0a9b8a" />
    </svg>
  );
}
```
(Repeat for `HouseCtrip` with `#1a6fd0`.)

- [ ] **Step 3: Make the marker icon map provider-aware**

In `web/src/components/CandidateLayer.tsx`, replace the ternary (lines 9-13) and widen the helper type (line 58):
```tsx
import { HouseAmap } from '../icons/HouseAmap';
import { HouseCtrip } from '../icons/HouseCtrip';

type CandidateProvider = 'airbnb' | 'booking' | 'amap' | 'ctrip';
const ICONS: Record<CandidateProvider, () => JSX.Element> = {
  airbnb: HouseAirbnb, booking: HouseBooking, amap: HouseAmap, ctrip: HouseCtrip,
};

export function candidateDivIcon(provider: CandidateProvider, priceLabel: string | null): L.DivIcon {
  const Icon = ICONS[provider];
  const iconSvg = renderToStaticMarkup(<Icon />);
  // ...rest unchanged...
}
```
Also change `filterUnsavedCandidates` param (line 58) to `Array<{ provider: CandidateProvider; externalId: string }>`.

- [ ] **Step 4: Add marker colours**

In `web/src/styles/globals.css`, add class rules mirroring `.bpm-marker--booking`:
```css
.bpm-marker--amap { --bpm-marker-accent: #0a9b8a; }
.bpm-marker--ctrip { --bpm-marker-accent: #1a6fd0; }
```
(Match whatever custom-property/border pattern the existing `--airbnb`/`--booking` rules use.)

- [ ] **Step 5: Verify web build + typecheck**

Run: `npm run typecheck && npm run build --workspace web` (or the repo's web build script)
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/api.ts web/src/icons/HouseAmap.tsx web/src/icons/HouseCtrip.tsx web/src/components/CandidateLayer.tsx web/src/styles/globals.css
git commit -m "feat(web): render amap + ctrip candidate markers"
```

---

# Phase 4 — Docs

## Task 13: Documentation

**Files:**
- Modify: `docs/discover.md`, `docs/data-sources.md`

- [ ] **Step 1: Update Discover provider config docs**

In `docs/discover.md`, extend the `SEARCH_PROVIDERS` section to list `amap` and `ctrip`, document `AMAP_KEY` (real-name key required, ~100/day quota, 30-day result cache), and note Ctrip is anonymous-scrape + geocoded (address-level precision, may be blocked by anti-bot → shows as a warning).

- [ ] **Step 2: Update data-sources overview**

In `docs/data-sources.md`, add Amap + Ctrip rows to the sources table (China-only; Discover-only in v1; coords converted from GCJ-02).

- [ ] **Step 3: Commit**

```bash
git add docs/discover.md docs/data-sources.md
git commit -m "docs: document amap + ctrip Discover providers"
```

---

## Final verification

- [ ] `npm run typecheck && npm run lint && npm test` — all green.
- [ ] Manual end-to-end with a real `AMAP_KEY`: Discover ON over a China city → Amap pins land accurately (WGS-84), Ctrip pins appear (or a graceful warning), no console errors.
- [ ] Confirm `SEARCH_PROVIDERS=airbnb,booking` (default) behaviour is unchanged (Amap/Ctrip only active when explicitly enabled + `AMAP_KEY` set).

## Notes for the implementer
- **Do not** commit real API keys. `AMAP_KEY` lives only in `.env`.
- If Ctrip's list structure differs from Task 10's assumption, the fixture-first step is your source of truth — adjust parser + fixture together; do not fake coordinates.
- Amap quota is genuinely tight; keep the 30-day cache and circuit breaker intact.
