# Database schema

One SQLite file at `db/backpackermap.sqlite` (override with `DB_PATH`). Created on first run, migrated on every server / ingest start. Migrations live in [`src/db/migrations/`](../src/db/migrations) and are applied in numeric order, tracked via the internal `_migration` table.

```
0001_init.sql               source, trail, property, distance_cache
0002_candidate.sql          candidate, search_cache, property.promoted_from_candidate_id
0003_pois.sql               poi; rebuild source.kind to add 'google_maps';
                            replace distance_cache → route_cache (trails + pois)
0004_poi_carpark.sql        poi_carpark; route_cache.via_carpark_{lat,lng}
0005_route_geometry.sql     route_cache.geometry
0006_candidate_route_cache.sql  candidate_route_cache (Discover route reuse)
```

## Inspecting the DB

```bash
sqlite3 db/backpackermap.sqlite '.schema'           # full schema
sqlite3 db/backpackermap.sqlite '.tables'           # tables only
sqlite3 db/backpackermap.sqlite 'SELECT * FROM _migration;'   # which migrations are applied
```

## Tables

### `source`

One row per data source you've ingested from (used by `trail`, `property`, `poi` as the upstream tag).

| Column        | Type | Notes                                                 |
| ------------- | ---- | ----------------------------------------------------- |
| `id`          | int  | PK                                                    |
| `kind`        | text | `alltrails` \| `airbnb` \| `booking` \| `google_maps` |
| `ingested_at` | text | `datetime('now')`                                     |

Single-row-per-kind: `getOrCreateSource()` upserts on `kind`.

### `trail`

One row per `.gpx` ingested. Identity is `(source_id, external_id)` where `external_id` is the file's path relative to `TRAILS_DIR` (forward-slashed). Renaming or moving a `.gpx` therefore creates a new trail — see [data-sources.md → Amend / add / delete a trail](./data-sources.md#amend--add--delete-a-trail).

| Column                  | Type  | Notes                                                   |
| ----------------------- | ----- | ------------------------------------------------------- |
| `id`                    | int   | PK                                                      |
| `source_id`             | int   | FK → `source.id`                                        |
| `external_id`           | text  | Relative POSIX path under `TRAILS_DIR`                  |
| `name`                  | text  | From `<trk><name>` or filename fallback                 |
| `trailhead_lat/lng`     | real  | First point of first track/route                        |
| `length_meters`         | real? | Sum of haversine deltas; null if untracked              |
| `elevation_gain_meters` | real? | Sum of positive `<ele>` deltas                          |
| `geojson`               | text  | `{"type":"LineString","coordinates":[…]}` — stringified |
| `raw_path`              | text  | Absolute path on disk at ingest time                    |

Indexes: `idx_trail_geo (trailhead_lat, trailhead_lng)`.

### `property`

Your wishlist — one row per Airbnb / Booking listing you've saved. Identity is `(provider, external_id)`.

| Column                       | Type  | Notes                                                                               |
| ---------------------------- | ----- | ----------------------------------------------------------------------------------- |
| `id`                         | int   | PK                                                                                  |
| `source_id`                  | int   | FK → `source.id`                                                                    |
| `provider`                   | text  | `airbnb` \| `booking`                                                               |
| `external_id`                | text  | Airbnb listing id / Booking hotel id                                                |
| `name`, `url`                | text  |                                                                                     |
| `lat`, `lng`                 | real? | Null until enrichment succeeds; rows without coords are hidden in `/api/properties` |
| `price_label`                | text? | Free-form (`€110/night`); not parsed                                                |
| `photo_url`                  | text? |                                                                                     |
| `raw_json`                   | text  | Original provider payload                                                           |
| `enriched_at`                | text? |                                                                                     |
| `promoted_from_candidate_id` | int?  | FK → `candidate.id` (set on Discover→save promotion, NULL otherwise)                |

Indexes: `idx_property_geo (lat, lng)`. `ON DELETE`: deleting a property cascades `route_cache`.

### `poi`

Google Maps saved-list places. One row per place, scoped to a per-list `collection` name.

| Column        | Type  | Notes                                        |
| ------------- | ----- | -------------------------------------------- |
| `id`          | int   | PK                                           |
| `source_id`   | int   | FK → `source.id`                             |
| `collection`  | text  | Human name from `data/google/lists.json`     |
| `external_id` | text  | Google place id (`ChIJ…`) when available     |
| `name`        | text  |                                              |
| `lat`, `lng`  | real  |                                              |
| `category`    | text? | Raw Google taxonomy (lodging, restaurant, …) |
| `note`        | text? | Your private note (if any)                   |
| `url`         | text? |                                              |
| `address`     | text? |                                              |
| `raw`         | text  | Original scraped payload                     |
| `ingested_at` | text  |                                              |

Indexes: `idx_poi_geo (lat, lng)`, `idx_poi_collection (collection)`. Identity is `(source_id, external_id)`. Re-running `ingest:google` mirrors the upstream list per-collection — see [data-sources.md → Amend / add / delete a list](./data-sources.md#amend--add--delete-a-list).

### `route_cache`

One row per (property, target) driving-route lookup. `target` is either a trail or a POI; `(property_id, target_kind, target_id)` is the primary key. ORS is hit only on miss; the row stores meters + seconds + geometry forever (until the property is deleted, which cascades).

| Column                | Type  | Notes                                                                                                                                                                    |
| --------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `property_id`         | int   | FK → `property.id` (CASCADE)                                                                                                                                             |
| `target_kind`         | text  | `trail` \| `poi`                                                                                                                                                         |
| `target_id`           | int   | Loose FK — not enforced (so deleting a POI doesn't burn the cache)                                                                                                       |
| `meters`, `seconds`   | real  | From ORS                                                                                                                                                                 |
| `computed_at`         | text  |                                                                                                                                                                          |
| `via_carpark_lat/lng` | real? | When ORS couldn't reach a POI directly and Overpass found a nearby `amenity=parking`, this stores the snap point (and `meters`/`seconds` reflect the via-parking detour) |
| `geometry`            | text? | JSON `[[lng, lat], …]` from ORS (`geometry_simplify=true`); NULL on pre-0005 rows                                                                                        |

### `candidate_route_cache`

Same shape as `route_cache` but keyed by `candidate_id` (CASCADE on `candidate`). Lets Discover candidates show driving distances before being promoted — and survive the promotion without recomputing.

### `candidate`

Discover-mode results. Identity is `(provider, external_id)`; the same listing appearing in two searches is one row (with `last_seen_at` bumped). Promotion to `property` copies the row over and back-links via `property.promoted_from_candidate_id`.

| Column                                | Type         | Notes                                              |
| ------------------------------------- | ------------ | -------------------------------------------------- |
| `id`                                  | int          | PK                                                 |
| `provider`                            | text         | `airbnb` \| `booking`                              |
| `external_id`                         | text         |                                                    |
| `name`, `url`                         | text         |                                                    |
| `lat`, `lng`                          | real         | Required (no null candidates)                      |
| `price_label`                         | text?        | Normalised to per-stay total when nights are known |
| `price_amount`, `currency`            | real?, text? |                                                    |
| `photo_url`, `rating`, `review_count` | …            |                                                    |
| `raw_json`                            | text         | Provider payload                                   |
| `first_seen_at`, `last_seen_at`       | text         |                                                    |

Indexes: `idx_candidate_geo (lat, lng)`.

### `search_cache`

Memoises `/api/search` for 10 minutes per canonical query. Key is sha1 of `(rounded bbox, dates, filters, provider scope)`; value is the list of candidate ids.

| Column          | Type | Notes                                          |
| --------------- | ---- | ---------------------------------------------- |
| `cache_key`     | text | PK — sha1 hex                                  |
| `query_json`    | text | Canonicalised query (debug aid)                |
| `provider`      | text | `'all'` in practice — multi-provider aggregate |
| `candidate_ids` | text | JSON int array                                 |
| `fetched_at`    | text |                                                |

Indexes: `idx_search_cache_fetched (fetched_at)`. Pruned in-process every hour to TTL × 6. Use [`scripts/cleanup_search_cache.ts`](../scripts/cleanup_search_cache.ts) to remove poisoned empty-result rows from old (pre-2026) DBs.

### `poi_carpark`

Per-POI lookup of the nearest `amenity=parking` from OSM Overpass. Negative results are tombstoned (`lat=lng=NULL`) so a single Overpass round-trip is enough per POI.

| Column       | Type  | Notes                                     |
| ------------ | ----- | ----------------------------------------- |
| `poi_id`     | int   | PK, FK → `poi.id` (CASCADE)               |
| `lat`, `lng` | real? | `(NULL,NULL)` = "searched, nothing found" |
| `radius_m`   | int   | Search radius used                        |
| `fetched_at` | text  |                                           |

### `_migration`

Internal: which `NNNN_*.sql` files have been applied. Don't edit; `migrate()` writes one row per file.

## Foreign-key behaviour

`PRAGMA foreign_keys = ON` is enforced at runtime. Cascades you'll notice in practice:

- Deleting a `property` → drops its `route_cache` rows.
- Deleting a `poi` → drops its `poi_carpark` row.
- Deleting a `candidate` → drops its `candidate_route_cache` rows.
- `route_cache.target_id` is **not** an enforced FK (so removing a POI doesn't kill cached property→POI routes that happen to be stale; they just become unreachable lookups).

## Why so many ALTER TABLE rebuilds?

SQLite can't add CHECK constraints to existing tables, so adding a new `source.kind` value (`google_maps` in 0003) means rebuilding the table. The migration runner toggles `foreign_keys` off around table rebuilds, asserts `PRAGMA foreign_key_check` is empty afterwards, and only then commits. See the comment in [`src/db/schema.ts`](../src/db/schema.ts) and the SQLite docs at <https://www.sqlite.org/lang_altertable.html#otheralter>.
