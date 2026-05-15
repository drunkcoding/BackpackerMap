# Architecture

## Stack

- **Node 20+ / TypeScript / Express / better-sqlite3** — backend
- **Vite + React 19 + react-leaflet** — frontend
- **Playwright** — Booking + Google Maps ingest, future e2e
- **Python 3.10+ with `pyairbnb`** — Airbnb enrichment + Discover-mode Airbnb provider
- **OpenRouteService** — driving distance / time / road-snapped geometry
- **OSM Nominatim** — free fallback geocoding for Booking hotels missing `geo`
- **Fonts**: Fraunces (display) + Newsreader (body) + IBM Plex Mono (data), self-hosted via `@fontsource`

## Layout

```
src/                       backend (TypeScript)
  db/                      schema + repo + migrations (0001 init, 0002 candidate, 0003 pois,
                           0004 poi_carpark, 0005 route_geometry, 0006 candidate_route_cache)
  ingest/                  gpx, trails, airbnb, booking, google + google-list,
                           geocode (Nominatim), stealth, CLI
  routing/                 ors.ts (OpenRouteService client + route cache) + overpass.ts
                           (car-park snap for POIs)
  search/                  Discover mode
    providers/             pyairbnb + booking-diy (the two live providers),
                           airbnb-url + booking-url (URL builders consumed by the live providers),
                           apify-airbnb + apify-booking + booking-demand-api (3 stubs)
    canonical.ts           sha1 cache key with bbox rounding
    amenities.ts           20-amenity catalog (Airbnb int + Booking facility codes)
    price.ts               currency/price normalisation
    dispatcher.ts          Promise.allSettled aggregator + dedup
    types.ts               SearchQuery, ProviderResult, SearchProvider
  server/
    app.ts                 createApp(deps) factory — also serves web/dist when webDistDir is set
    server.ts              entry point: env wiring + listen()
    routes/search.ts       GET /api/search, POST /candidates/:id/promote
    routes/geocode.ts      GET /api/geocode, GET /api/geocode/polygon
    geocode/               Photon client + polygon fetcher (free-text location search)
  lib/                     pyairbnb single-listing spawn wrapper
web/                       frontend (Vite + React workspace)
  src/App.tsx              shell
  src/api.ts               typed fetch client
  src/components/          UI components (saved + Discover, 3-tier FilterBar)
  src/hooks/               useProperties, useTrails, usePois, useDistance, useSearch,
                           useSearchFilters, useLocationSelection, useVisibleCollections,
                           useFetch
  src/lib/                 pure: formatCoord, formatDistance, formatDuration, haversine,
                           nearestTrails, nearestPois, nearestRadius, bboxHysteresis,
                           pointInPolygon, searchQuery, escapeHtml
  src/icons/               inline SVG components
  src/styles/              tokens.css + globals.css + textures.css
scripts/                   pyairbnb_enrich.py + pyairbnb_search.py + ingest_example.ts (demo loader)
                           + cleanup_search_cache.ts + test mocks
examples/quickstart/       Bundled demo dataset (Tre Cime trail + Cortina fake property)
docs/                      Reference docs (this folder)
tests/
  unit/                    pure-function and provider unit tests
  integration/             supertest-based HTTP and ingest integration tests
  fixtures/                GPX, Airbnb JSON, Booking HTML, ORS JSON
data/                      (gitignored) user-supplied GPX, exports, cookies
db/                        (gitignored) runtime SQLite + WAL/SHM sidecars
.sisyphus/plans/           Design notes + decision logs (agent-tooling artifacts)
Dockerfile.demo            Multi-stage demo image (Node 20 slim, no Python/Playwright at runtime)
docker-compose.yml         One-service demo deployment
```

## Single-port vs two-terminal serving

The backend Express app (`src/server/app.ts`) optionally serves the built web bundle from `web/dist` when `WEB_DIST_DIR` (or the default `web/dist`) exists. That's how `npm run demo` and the Docker image work — one process, one port.

For development with hot-reload you still want two processes: `npm run dev` (Express on `:3000`) + `npm run dev:web` (Vite on `:5173` with `/api` proxy). The static-serve middleware sits behind the SPA fallback regex `^(?!\/api\/|\/healthz$).*` so it never shadows API routes.

## Data flow

1. **Ingest**: one of `ingest:{trails,airbnb,booking,google,example}` writes rows into SQLite. Each table has a `(source_id, external_id)` or `(provider, external_id)` unique key so re-ingesting upserts.
2. **Read**: web app calls `GET /api/properties` and `GET /api/trails` on load. Pins + trail polylines render immediately.
3. **Click property**: side panel opens, computes nearest trails by haversine distance (in-browser), then fires `POST /api/distance` for each (property, trail) pair.
4. **`/api/distance`**: checks `route_cache` in SQLite. Miss → calls OpenRouteService, writes back to cache. Returns `{ meters, seconds, geometry, cached, viaCarpark? }`. POIs use the same code path with an extra Overpass-driven car-park snap step.
5. **Hover trail row**: web app re-fetches `/api/distance` with `includeGeometry`, draws the brass route polyline.

## CI

See [docs/troubleshooting.md#what-runs-in-ci](./troubleshooting.md#what-runs-in-ci).
