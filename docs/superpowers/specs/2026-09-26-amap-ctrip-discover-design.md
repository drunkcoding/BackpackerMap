# Design: Amap + Ctrip (China) Discover accommodation providers

- **Date**: 2026-09-26
- **Status**: Approved (design), pending implementation plan
- **Tracking issue**: [drunkcoding/BackpackerMap#1](https://github.com/drunkcoding/BackpackerMap/issues/1)
- **Feature**: Add Amap (高德) and Ctrip (携程) as Discover-mode live-search providers surfacing hotels + 民宿 (B&B) in mainland China.

## 1. Summary & motivation

BackpackerMap merges accommodation with trails/POIs on one map. Its existing sources
(Airbnb, Booking, Google Maps) have poor-to-no coverage in mainland China, where Amap and
Ctrip are the dominant datasets. This feature adds two new `SearchProvider`s to the existing
Discover pipeline so that panning a China bbox shows nearby hotels and 民宿 as candidate pins,
with the usual driving-distance-to-trails treatment where routing permits.

## 2. Decisions locked (from brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Integration surface | **Discover live-search** (not saved/wishlist ingest) |
| 2 | Scope | **Both Amap + Ctrip** in this iteration |
| 3 | Amap access | **Official Web Service POI API** (user can obtain a real-name-verified key) |
| 4 | Ctrip coordinates | **Scrape list page + geocode the address** (no signed-API reverse-engineering) |
| 5 | Amap quota defense | **Long-TTL Amap result cache + in-memory daily circuit breaker** |

## 3. Verified research (do not re-derive)

### Amap Web Service POI API
- **Endpoint** (bbox fit): `GET https://restapi.amap.com/v3/place/polygon?polygon=<tlLng>,<tlLat>|<brLng>,<brLat>&types=<codes>&offset=25&page=<n>&key=<KEY>`. A rectangle is passed as the top-left + bottom-right vertex pair. (v5 equivalent: `/v5/place/polygon`, `page_size`≤25 × `page_num`≤100.)
- **Accommodation typecodes** (official amap_poicode): hotels = `100100` (100101 luxury … 100105 economy chain); inns/hostels ≈ B&B = `100200` (incl. 100201 youth hostel); parent `100000` = all lodging. No dedicated 民宿 typecode — 民宿 fall under `100200`; refine with `keywords=民宿` if needed. **v1 uses `types=100100|100200`.**
- **Coordinates**: returns GCJ-02.
- **Key**: requires 实名 (real-name) verification — mainland-China ID + mobile via Alipay. Confirmed available for this project.
- **Free quota**: individual verified developer ≈ 100 polygon-search calls/day (QPS 3). This is the binding constraint (see §7).
- **POI fields used**: `id`, `name`, `location` ("lng,lat"), `typecode`, `address`, `tel`, `photos[].url`.

### Ctrip
- **Anonymous list page works** with the canonical six-param URL: `https://hotels.ctrip.com/hotels/list?flexType=1&cityId=<n>&provinceId=0&districtId=0&countryId=1&checkin=…&checkout=…`. The simplified `?city=…` form redirects to `passport.ctrip.com` login (bot gate keyed on URL completeness).
- List data lives in the `window.IBU_HOTEL` React global (`initData.firstPageList.hotelList.list[]`), exposing name / score / price / address — **but NO lat/lng and NO hotelId in the DOM**.
- Exact coordinates sit behind a signed, `eleven`-fingerprinted, font-encrypted mobile API → **out of scope** for v1; we geocode the address instead.
- **Datum**: GCJ-02 basemap (verify empirically at implementation).

## 4. Architecture

### 4.1 Data flow (unchanged pipeline)
`GET /api/search?north=…` → `canonicaliseQuery` → aggregate 10-min cache → `dispatcher.search(query)` runs enabled providers via `Promise.allSettled` → each returns `ProviderResult[]` **with WGS-84 coords** → dedup by `provider:externalId` → route `upsertCandidate`s each → pins render. A failing provider yields only a warning; others still return (existing behavior in [`dispatcher.ts`](../../../src/search/dispatcher.ts) and [`routes/search.ts`](../../../src/server/routes/search.ts)).

### 4.2 New files
- `src/search/coords.ts` — pure `wgs84ToGcj02()` / `gcj02ToWgs84()` (+ `bd09` guards). The published coordtransform algorithm. Unit-tested.
- `src/search/providers/amap.ts` — `AmapProvider implements SearchProvider` (`provider = 'amap'`), injected `{ apiKey, fetchJson, cache }`.
- `src/search/providers/amap-url.ts` — builds the `/v3/place/polygon` request from a WGS-84 bbox (converts corners to GCJ-02).
- `src/search/providers/amap-geocode.ts` — `createAmapGeocoder({ apiKey, fetchJson })` conforming to the existing `Geocoder` interface (returns WGS-84; converts GCJ-02→WGS-84 internally).
- `src/search/providers/ctrip.ts` — `CtripProvider implements SearchProvider` (`provider = 'ctrip'`), injected `{ fetchHtml, geocoder }`.
- `src/search/providers/ctrip-url.ts` — builds the canonical six-param list URL; maps bbox → `cityId`.
- `src/db/migrations/0007_amap_ctrip.sql` — rebuild `source`, `property`, `candidate` to widen `CHECK` constraints (+`amap`,`ctrip`), following the [`0003_pois.sql`](../../../src/db/migrations/0003_pois.sql) pattern.

### 4.3 Changed files
- `src/search/types.ts` — `ProviderName` → `'airbnb' | 'booking' | 'amap' | 'ctrip'`.
- `src/server/server.ts` — widen the `SEARCH_PROVIDERS` filter (line 30); read `AMAP_KEY`; push `AmapProvider` + `CtripProvider` into `allProviders` (Ctrip reuses the shared Playwright `fetchHtml` closure).
- `src/search/price.ts` — add `amap` (no price) / `ctrip` (label passthrough) branches.
- `web/src/…` — FilterBar provider chips + candidate marker styling for the two sources; `api.ts` provider type.
- `.env.example`, `docs/discover.md`, `docs/data-sources.md`.

### 4.4 Coordinate handling (bidirectional — critical)
The map/bbox is WGS-84; Amap's API expects **GCJ-02 input**.
- **Amap**: convert bbox corners WGS-84→GCJ-02 for the `polygon` param; convert each returned POI GCJ-02→WGS-84 before emitting.
- **Ctrip**: geocoded coords are already WGS-84 (Amap geocoder converts internally; Nominatim is native WGS-84) — no extra step.
- All conversion isolated in `coords.ts`; providers never emit non-WGS-84.

## 5. Amap provider

- Build polygon from the (converted) bbox; `types=100100|100200`; page `offset=25 × page` up to `query.maxResults`.
- Map each POI → `ProviderResult` (`externalId=id`, `lat/lng` from converted `location`, `photoUrl` from `photos[0]`, `priceLabel=null`, `rawJson`).
- Pure `fetch` (inject `fetchJson` for tests), no browser. Errors → `ProviderError` (dispatcher warns, others unaffected).

## 6. Ctrip provider

- Anonymous Playwright fetch of the canonical six-param list URL via the server's shared browser (`fetchHtml`).
- Parse `window.IBU_HOTEL` → list of {name, price, address, score}. Geocode address (Amap geocoder → Nominatim fallback) → WGS-84. Drop rows that fail to geocode (candidate table requires non-null coords).
- `externalId`: derive a stable id from the hotel name+address hash if no id is scrapable (documented tradeoff; may cause cross-search churn — acceptable v1).
- Detect the `passport.ctrip.com` login redirect → throw `ProviderError` (surfaces as a dispatcher warning).

## 7. Amap quota strategy (the binding constraint)

~100 calls/day vs one search per map pan → must minimize calls:
- **Amap-only result cache** keyed on **(grid-snapped bbox, types) only** — deliberately ignoring dates/guests/price/filters, because POIs do not depend on them. Long TTL (accommodation POIs are stable; e.g. 30 days). Implementation may reuse the `search_cache` table with a dedicated `'amap'` scope + reduced key, or a small dedicated store — decided in the plan.
- **Grid snap**: quantize bbox to a coarse grid so nearby pans reuse one cache entry.
- **Daily circuit breaker**: in-memory per-day counter; when near the cap, `AmapProvider.search` returns `[]` + a warning rather than erroring. Single-user app makes this workable.

## 8. Error handling & degradation

- Per-provider failure → `Promise.allSettled` → dispatcher warning; route skips cache-poisoning when any provider warned (existing).
- Amap quota exhausted → circuit breaker returns `[]` + warning.
- Geocode miss (Ctrip) → drop that candidate.
- Ctrip login redirect / anti-bot → `ProviderError`; optional `HTTPS_PROXY` passthrough like the other providers.

## 9. Testing

- `coords.ts`: unit tests with known reference points + round-trip tolerance.
- Amap provider: unit test against a fixture POI JSON (verify GCJ-02→WGS-84 offset applied, category filter, paging).
- Ctrip parser: unit test against a saved `window.IBU_HOTEL` fixture; geocoder mocked.
- Migration applies cleanly (existing migration test harness); `PRAGMA foreign_key_check` empty.
- Gate: `npm run typecheck && npm run lint && npm test` green.

## 10. Out of scope (v1)

Cross-provider dedup (Amap/Ctrip/Booking overlap → separate pins); exact Ctrip coordinates via the signed API (later spike); a China-specific routing engine (ORS may degrade to haversine); saved/wishlist ingest for either source; Baidu Maps.

## 11. Open risks / empirical verification points

1. **Ctrip `window.IBU_HOTEL` shape** — exact field paths and whether the current list payload still carries `address` must be confirmed early (save a live fixture first). If address is absent/coarse, pin precision drops or Ctrip needs re-scoping.
2. **bbox → Ctrip `cityId`** — needs a mapping strategy (drive the homepage once to harvest, or a static table for target cities).
3. **Ctrip anti-bot drift** — the canonical-URL bypass may stop working; treat as provider failure, consider proxy.
4. **Amap datum for geocoding** — confirm Amap geocoding returns GCJ-02 (expected) so conversion is applied consistently.
5. **Amap quota realism** — even with caching, very heavy first-time exploration can hit 100/day; circuit breaker keeps the app usable.

## 12. References

- Pipeline: [`src/search/types.ts`](../../../src/search/types.ts), [`dispatcher.ts`](../../../src/search/dispatcher.ts), [`canonical.ts`](../../../src/search/canonical.ts), [`routes/search.ts`](../../../src/server/routes/search.ts), [`server.ts`](../../../src/server/server.ts)
- Provider templates: [`providers/booking-diy.ts`](../../../src/search/providers/booking-diy.ts) (Playwright+geocode), [`providers/pyairbnb.ts`](../../../src/search/providers/pyairbnb.ts) (HTTP)
- Geocoder to reuse: [`src/ingest/geocode.ts`](../../../src/ingest/geocode.ts)
- Schema/migration pattern: [`src/db/migrations/0003_pois.sql`](../../../src/db/migrations/0003_pois.sql), [`docs/schema.md`](../../schema.md)
- Coordinate/routing assumptions: [`docs/architecture.md`](../../architecture.md)
- External: Amap Web Service POI docs (lbs.amap.com), amap_poicode table; `wandergis/coordtransform` (algorithm reference).
