# HTTP API

Single Express app on `:3000` (configurable via `PORT`). Same process serves the React bundle from `web/dist` when it exists; everything below is reachable from the browser at `/api/*` or from `curl`.

| Method | Path                          | What it does                                                 |
| ------ | ----------------------------- | ------------------------------------------------------------ |
| GET    | `/healthz`                    | Liveness probe — `{ ok: true }`                              |
| GET    | `/api/properties`             | All ingested properties with coordinates                     |
| DELETE | `/api/properties/:id`         | Remove one property (cascades route_cache)                   |
| GET    | `/api/trails`                 | All ingested trails (summary; no polyline)                   |
| GET    | `/api/trails/:id`             | One trail incl. parsed GeoJSON polyline                      |
| GET    | `/api/pois`                   | All ingested Google Maps POIs                                |
| GET    | `/api/distance`               | Driving distance + time (+ optional geometry) for one pair   |
| GET    | `/api/search`                 | Discover-mode search (Airbnb + Booking, live)                |
| POST   | `/api/candidates/:id/promote` | Promote a Discover candidate into the saved-properties table |
| GET    | `/api/geocode`                | Free-text location autocomplete (Photon)                     |
| GET    | `/api/geocode/polygon`        | Region polygon by OSM id (Nominatim lookup)                  |

CORS allows `http://localhost:5173` by default (set `corsOrigin` in [`createApp()`](../src/server/app.ts) to change). All responses are JSON; all errors return `{ "error": string, ... }` with a 4xx/5xx status.

---

## `GET /api/properties`

```jsonc
[
  {
    "id": 7,
    "provider": "airbnb", // 'airbnb' | 'booking'
    "externalId": "12345",
    "name": "…",
    "url": "https://…",
    "lat": 46.5395,
    "lng": 12.1352,
    "priceLabel": "€110/night", // string or null
    "photoUrl": null,
  },
]
```

Filters out rows where `lat`/`lng` are null. No pagination — the list is your wishlist, ingested locally.

## `DELETE /api/properties/:id`

`204 No Content` on success; `400` if id is non-numeric; `404` if not found. Cascades `route_cache` rows (so cached driving distances are dropped with the property).

## `GET /api/trails`

```jsonc
[
  {
    "id": 1,
    "name": "Three Peaks of Lavaredo",
    "trailheadLat": 46.6184,
    "trailheadLng": 12.31211,
    "lengthMeters": 10238.5, // number or null
    "elevationGainMeters": 612, // number or null
  },
]
```

No polyline — use `GET /api/trails/:id` for the full LineString. Frontend pulls the summary on map load to render markers.

## `GET /api/trails/:id`

```jsonc
{
  "id": 1,
  "externalId": "example/tre-cime-di-lavaredo.gpx",
  "name": "…",
  "trailheadLat": 46.6184,
  "trailheadLng": 12.31211,
  "lengthMeters": 10238.5,
  "elevationGainMeters": 612,
  "geojson": { "type": "LineString", "coordinates": [[lng, lat], ...] },
}
```

`geojson` is the already-parsed object, not a stringified payload.

## `GET /api/pois`

```jsonc
[
  {
    "id": 14,
    "collection": "Dolomites", // Google list name from data/google/lists.json
    "externalId": "ChIJ…",
    "name": "Rifugio Auronzo",
    "lat": 46.611,
    "lng": 12.299,
    "category": "lodging", // optional, raw Google taxonomy
    "note": null, // optional, your private note from Google Maps
    "url": "https://maps.google.com/?cid=…",
    "address": "…",
  },
]
```

Frontend hides POIs by default — visibility is per-collection, persisted client-side in `localStorage` under `bpm:visiblePoiCollections`.

## `GET /api/distance`

Driving distance + time + (optionally) road-snapped geometry. Backed by `route_cache` (for saved properties) or `candidate_route_cache` (for Discover candidates).

### Query params

| Param         | Type         | Required | Notes                                                                         |
| ------------- | ------------ | -------- | ----------------------------------------------------------------------------- |
| `propertyId`  | int          | one of   | Saved-property origin                                                         |
| `candidateId` | int          | one of   | Discover-candidate origin (mutually exclusive with `propertyId`)              |
| `targetKind`  | `trail\|poi` |          | If omitted, defaults to `trail` (and `trailId` is read instead of `targetId`) |
| `targetId`    | int          | usually  | Target row id; with the legacy form, pass `trailId`                           |
| `trailId`     | int          | legacy   | Pre-POI compatibility — equivalent to `targetKind=trail&targetId=…`           |

### Response — happy path

```jsonc
{
  "meters": 18472.3,
  "seconds": 1684.5,
  "cached": true,                // false on first call → ORS was hit
  "viaCarpark": { "lat": 46.61, "lng": 12.30 },  // present only on POI car-park fallback
  "geometry": [[12.13, 46.54], [12.14, 46.55], …]  // present only when ORS returned a polyline
}
```

`geometry` is `[lng, lat]` pairs (GeoJSON order), simplified by ORS. `viaCarpark` is included when the origin couldn't reach the POI directly and routing was redirected to a nearby OSM `amenity=parking`. Missing fields = absent (not `null`).

### Response — error paths

| Status | Body                                                            | When                                                                       |
| ------ | --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 400    | `{ "error": "propertyId or candidateId required" }` and similar | Bad / missing params                                                       |
| 404    | `{ "error": "property not found" }` / `"trail not found"`       | Unknown id, or property/candidate has no lat/lng                           |
| 422    | `{ "error": "no driving route", "detail": "…" }`                | ORS returned no routable path (trailhead or property >350 m from any road) |
| 429    | `{ "error": "ORS rate limit" }`                                 | Hit the 40 req/min or 2,000 req/day cap                                    |
| 502    | `{ "error": "ORS …" }`                                          | ORS upstream failure (network, 5xx, malformed response)                    |

422 responses are not cached; the user can retry once the trailhead is moved closer to a road. POIs additionally try a car-park snap via Overpass before returning 422.

## `GET /api/search` (Discover mode)

Only mounted when a search dispatcher is wired (default in production; tests can omit it). Aggregates the configured providers (`SEARCH_PROVIDERS`, default `airbnb,booking`) via `Promise.allSettled`, dedupes by `(provider, externalId)`, and caches by (canonical query, "all") for 10 minutes.

### Query params

| Param                                                 | Default | Notes                                                                                       |
| ----------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------- |
| `north,south,east,west`                               | —       | Required, must satisfy `north>south` and `east>west`                                        |
| `zoom`                                                | 12      | Used by Airbnb URL builder; coerced to a finite number                                      |
| `checkin`,`checkout`                                  | null    | `YYYY-MM-DD` strings; required to get prices on most listings                               |
| `adults`                                              | 2       | `children` 0, `infants` 0, `pets` 0                                                         |
| `currency`                                            | EUR     | Provider may not honour every currency                                                      |
| `maxResults`                                          | 50      | Capped at 100                                                                               |
| `mode`                                                | `list`  | `detail` triggers per-listing detail fetches (slower, richer fields)                        |
| `priceMin`,`priceMax`                                 | —       | Per-night totals                                                                            |
| `freeCancellation`                                    | —       | `'true'` enables; anything else = unset                                                     |
| `minBedrooms`, `minBathrooms`, `minBeds`, `minRating` | —       |                                                                                             |
| `roomTypes`                                           | —       | Comma-separated subset of `entire,private,shared,hotel`                                     |
| `amenities`                                           | —       | Comma-separated amenity slugs (see [`src/search/amenities.ts`](../src/search/amenities.ts)) |
| `mealPlans`                                           | —       | `breakfast,half_board,all_inclusive`                                                        |
| `neighbourhoods`                                      | —       | Comma-separated free text                                                                   |
| `hostTypes`                                           | —       | Comma-separated                                                                             |

### Response

```jsonc
{
  "cached": true,
  "candidates": [
    {
      "id": 42,
      "provider": "airbnb",
      "externalId": "12345",
      "name": "…",
      "url": "https://airbnb.com/rooms/12345",
      "lat": 46.54,
      "lng": 12.13,
      "priceLabel": "€700 total", // normalised per-stay total when nights are known
      "priceAmount": 700.0,
      "currency": "EUR",
      "photoUrl": "https://…",
      "rating": 4.87, // 0..5 or null
      "reviewCount": 124,
      "rawJson": "{ … original provider payload … }",
      "firstSeenAt": "2026-05-12 10:30:00",
      "lastSeenAt": "2026-05-15 09:11:14",
    },
  ],
  "warnings": [
    // per-provider failures, "all" status
    { "provider": "booking", "reason": "playwright timeout after 8000ms" },
  ],
}
```

If any provider returns a warning, the result is **not** cached, an `X-Search-Warnings` response header is added, and the next identical search refetches. Empty-result caches were a known foot-gun pre-2026; see [`scripts/cleanup_search_cache.ts`](../scripts/cleanup_search_cache.ts) to purge old DBs.

## `POST /api/candidates/:id/promote`

Move a Discover candidate into the `property` table. The candidate row stays (linked via `property.promoted_from_candidate_id`) so re-running the same Discover search won't show it as a candidate again.

```jsonc
// 200 OK
{ "property": { "id": 99, "provider": "airbnb", "externalId": "12345", "name": "…", … } }

// 400 / 404
{ "error": "invalid candidate id" } | { "error": "candidate not found" }
```

## `GET /api/geocode`

Photon free-text location autocomplete (forwards to `https://photon.komoot.io/api`). Powers the "Jump to location" search box in the toolbar.

```http
GET /api/geocode?q=Cortina
```

```jsonc
{
  "results": [
    {
      "id": "R:48025",
      "osmType": "R",                    // 'N' (node) | 'W' (way) | 'R' (relation)
      "osmId": 48025,
      "name": "Cortina d'Ampezzo",
      "label": "Cortina d'Ampezzo, Veneto, Italy",
      "kind": "town",                    // 'city' | 'town' | 'region' | 'country'
      "center": { "lat": 46.5395, "lng": 12.1352 },
      "bbox": { "north": …, "south": …, "east": …, "west": … },  // or null
      "hasPolygon": true,                // hint that /geocode/polygon will return geometry
    },
  ],
}
```

Returns `{ "results": [] }` for queries shorter than 2 characters. Upstream failures yield `502 { "error": "geocode upstream failure", "message": … }`.

## `GET /api/geocode/polygon`

Fetch the GeoJSON boundary for an OSM relation/way/node (used to draw a region outline once a search result is selected). Hits Nominatim's `lookup` endpoint.

```http
GET /api/geocode/polygon?osm_type=R&osm_id=48025
```

```jsonc
// 200
{ "osmType": "R", "osmId": 48025, "geometry": { "type": "Polygon", "coordinates": […] } }

// 400 — bad params
{ "error": "osm_type must be 'N', 'W', or 'R'" }

// 404 — Nominatim returned no polygon
{ "error": "no polygon available for this OSM id" }

// 502 — upstream failure
{ "error": "polygon upstream failure", "message": "…" }
```

Polygons are cached in-process (LRU). Restart the server to drop them.

---

## Quick smoke test

```bash
# from another terminal after `npm run demo`
curl -s http://localhost:3000/healthz
curl -s http://localhost:3000/api/properties | jq '.[] | .name'
curl -s 'http://localhost:3000/api/distance?propertyId=1&trailId=1' | jq
curl -s 'http://localhost:3000/api/geocode?q=Dolomites' | jq '.results[0]'
```

For development with hot-reload (Vite on `:5173`), the same paths work via Vite's `/api` proxy — see [getting-started.md](./getting-started.md) and [troubleshooting.md](./troubleshooting.md) for the port-mismatch foot-gun.
