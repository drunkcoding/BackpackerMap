# BackpackerMap

A self-hosted, single-user webapp that combines your saved AllTrails trails, Airbnb properties, and Booking.com properties on one map — with driving distance and time from each property to each trailhead.

Map renders in a deliberate "Expedition Field Journal" aesthetic: warm vellum background, OSM tiles softened with a journal filter, rust trail polylines, coral/slate property markers, brass dashed connection lines when you hover a trail row in the side panel.

## Quickstart

### 0. Prerequisites

- **Node.js 20+** ([nodejs.org](https://nodejs.org/))
- **Python 3.10+** — **strictly required**. `pyairbnb` uses match-statement syntax and will fail to import on Python ≤3.9 even though `pip install` succeeds. Check with `python3 --version`. If your default Python is 3.9 (common on Anaconda / older Ubuntu / macOS system Python), install 3.10+ separately and point `PYTHON_BIN` at it (see step 2).
- **An OpenRouteService API key** (free)

#### Get an ORS API key

1. Go to <https://openrouteservice.org/dev/#/signup>
2. Sign up (email + password, no card required)
3. Confirm email → open the dashboard → create a free-tier token
4. Free tier limits: 2,000 directions/day, 40 requests/minute. Easily enough for personal use; the app caches every distance result in SQLite, so you re-pay only once per (property, trail) pair.

### 1. Install

```bash
git clone <this-repo> backpackermap
cd backpackermap
npm install
npx playwright install chromium                            # for Booking.com ingest
python3.10 -m pip install --user pyairbnb                  # use Python ≥3.10 explicitly
# verify
python3.10 -c "import pyairbnb; print('ok')"
```

### 2. Configure

```bash
cp .env.example .env       # bash / zsh / git-bash
# OR on PowerShell:
# Copy-Item .env.example .env
```

Open `.env` and fill in at minimum:

- `ORS_API_KEY` — paste your OpenRouteService token
- `PYTHON_BIN` (recommended) — absolute path to Python ≥3.10 if your default `python3` is older. Example: `PYTHON_BIN=/usr/bin/python3.10` on Linux, `PYTHON_BIN=C:\Python310\python.exe` on Windows

Other env vars are optional; defaults work for most setups. See `.env.example` for the full list, including `SEARCH_PROVIDERS` (Discover mode) and `HTTPS_PROXY` (residential proxy).

### 3. Drop in your data

#### AllTrails GPX

1. Log in at <https://www.alltrails.com/>
2. Saved → Activities → click an activity → ⋯ → **Download route** → GPX Track
3. Save into `data/trails/`. Subfolders are supported and recommended: e.g. `data/trails/scotland/loch-ness.gpx`.
4. Run `npm run ingest:trails`.

Default root is `./data/trails` (override with `TRAILS_DIR` in `.env`). Glob is recursive and case-insensitive; symlinks aren't followed.

For each `*.gpx` the ingest parses:

| Field                    | Source                                                                                                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                   | `<trk><name>…</name>` if present, else the filename without `.gpx`                                                                                                                                                                             |
| trailhead                | The **first** point of the **first** track/route in the file. AllTrails downloads typically start at the trailhead; if you ever build a GPX in the wrong direction, the trailhead marker will land at the summit. Reverse the track to fix it. |
| length                   | Sum of haversine distance between consecutive points                                                                                                                                                                                           |
| elevation gain           | Sum of positive `<ele>` deltas (zero if the GPX has no elevation data)                                                                                                                                                                         |
| trail polyline           | Full `LineString` of points, drawn as the rust line on the map                                                                                                                                                                                 |
| identity (`external_id`) | Path **relative to `TRAILS_DIR`**, forward-slashed. So `cairngorms/loch-an-eilein.gpx` and `loch-an-eilein.gpx` are two different trails.                                                                                                      |

##### Amend / add / delete a trail

Unlike the Google list ingest (which is a per-collection mirror), `ingest:trails` is **insert-or-update only**. Deletion is manual.

| Operation                                                         | What to do                                                                                  | DB effect                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Add** a trail                                                   | Drop a new `.gpx` anywhere under `data/trails/`, run `npm run ingest:trails`                | New row inserted                                                |
| **Refresh** a trail (re-downloaded from AllTrails, same filename) | Overwrite the file in place, re-run                                                         | Row updated, `id` preserved → **cached driving routes survive** |
| **Move or rename** a `.gpx`                                       | The path-based identity changes → treated as a brand-new trail. Old row stays as an orphan. | Delete the old row manually (see below) before/after moving.    |
| **Delete** a trail                                                | Removing the `.gpx` from disk does **not** delete the DB row. Use the SQL below.            | Row removed                                                     |

```bash
# find the id
sqlite3 db/backpackermap.sqlite "SELECT id, external_id, name FROM trail;"

# delete one trail
sqlite3 db/backpackermap.sqlite "DELETE FROM trail WHERE id = 5;"
```

Cached `route_cache` rows that referenced this trail become unreachable lookups and are harmless; they'll be ignored on subsequent distance calls. Re-running `ingest:trails` after deletion will recreate the row from the file on disk (if still there) with a fresh `id`.

#### Airbnb personal data

1. Log in at <https://www.airbnb.com/account-settings/privacy-and-sharing>
2. **Request your personal data** → JSON → wait for the email (usually within an hour)
3. Download and unzip; place the resulting JSON file at `data/airbnb/personal_data.json`

This file contains your wishlists. The ingest step parses listing IDs from it, then calls `pyairbnb` to enrich each listing with lat/lng, current price, and photo.

#### Booking.com cookies

Booking.com has no personal data export, so we use a logged-in Playwright session.

1. Log in at <https://www.booking.com/> in Chrome
2. Install [**Cookie-Editor**](https://chrome.google.com/webstore/detail/cookie-editor) or **EditThisCookie**
3. Click the extension on `booking.com` → Export → **JSON**
4. Save to `data/booking/cookies.json`

Re-export whenever the session expires (the CLI will print a clear "re-export your cookies" message when that happens).

#### Google Maps saved-place lists (POIs)

Restaurants, viewpoints, parking spots, cafés, etc. that you've saved into a Google Maps list. Rendered as small slate dots on the map; surfaced under "Nearest places" in the property side panel with the same driving-distance treatment as trails.

1. In Google Maps, open a list you've saved (e.g. "Want to go" or a trip-specific list)
2. Tap **Share** → **Copy link** — you get something like `https://maps.app.goo.gl/9fS49rrZSPHCftvH9`
3. The list **must be public** ("anyone with the link can view"). Private/personal-only lists return an empty sign-in wall and are not supported in MVP.
4. Create `data/google/lists.json`:

```json
{
  "lists": [
    { "url": "https://maps.app.goo.gl/9fS49rrZSPHCftvH9", "name": "Scotland Trip 2026" },
    { "url": "https://maps.app.goo.gl/anotherListId", "name": "Dolomites" }
  ]
}
```

Each entry becomes one `collection` in the DB. The `name` field is technically optional (when omitted, BackpackerMap uses the list title rendered by Google itself), **but always set it explicitly** — the collection key is the `name`, not the URL. If Google ever rewords the page title (they do, silently), an unnamed entry will land in a new collection on the next ingest and leave the old one orphaned.

**Re-ingest mirrors Google.** Each run of `ingest:google` makes the DB match the current state of the list: added places are inserted, modified places are updated in place (their DB `id` is preserved, so cached driving distances stay valid), and **removed places are deleted from the DB** along with their cached routes. The mirror is scoped per-collection — re-ingesting list "Dolomites" never touches POIs in another collection.

Safety guard: if a scrape returns zero places (private list, selector broken, network blip), the ingest reports failure for that list and **does not delete** existing POIs.

This ingest uses headless Playwright (same pipeline as Booking.com). The Google Maps page format is unofficial — expect this to break and need a selector update once or twice a year, like any web scrape.

##### Amend / add / delete a list

| Operation                                               | What to do                                                                                         | DB effect                                                                                                                                           |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Add** a list                                          | Append `{ "url": "...", "name": "..." }` to `data/google/lists.json`, then `npm run ingest:google` | New collection inserted; places inserted                                                                                                            |
| **Refresh** a list (places edited inside Google)        | Just `npm run ingest:google` — no local edit needed                                                | Per-place: insert / update-in-place / delete (cached routes follow). DB ids preserved for unchanged places, so cached driving distances stay valid. |
| **Swap the share URL** (regenerated link, same content) | Edit `url` in `lists.json`, keep the same `name`, re-run                                           | Collection key unchanged; POIs stay in place; cached routes survive                                                                                 |
| **Rename** a collection                                 | First delete the old collection (see below), then change `name` in `lists.json` and re-run         | Without the delete step, the old POIs are **orphaned** under the old key — the new `name` is treated as a brand-new collection                      |
| **Delete** a list                                       | Run the SQL below, then remove the entry from `lists.json` so future runs don't recreate it        | Collection rows removed; `route_cache` rows cascade-delete                                                                                          |

```bash
# delete one collection (replace 'Dolomites' with the name from lists.json)
sqlite3 db/backpackermap.sqlite "DELETE FROM poi WHERE collection = 'Dolomites';"
# then edit data/google/lists.json to remove the entry
```

> Why not just empty the Google list and re-ingest to delete? Because the safety guard treats a zero-place scrape as failure and refuses to delete — by design, so a CAPTCHA/network blip can't wipe your POIs. Emptying-the-list-to-delete is intentionally not a path; use the SQL above.

##### Showing POI collections on the map

POI collection visibility is per-browser (stored in `localStorage` under `bpm:visiblePoiCollections`) and **defaults to off** — a freshly-ingested collection won't appear on the map until you toggle its chip on in the POI filter row of the side panel. If POIs aren't appearing after a successful `ingest:google`, check the chip state first.

### 4. Ingest

```bash
npm run ingest:all
```

Or step by step:

```bash
npm run ingest:trails               # GPX files → SQLite
npm run ingest:airbnb -- --dry-run  # preview: list listing IDs/URLs from the export, no API calls
npm run ingest:airbnb               # Airbnb export → pyairbnb → SQLite
npm run ingest:booking              # Playwright wishlist scrape → JSON-LD → SQLite
npm run ingest:google               # Playwright Google Maps list scrape → SQLite
```

If your Airbnb export schema doesn't match the parser's assumptions, the `--dry-run`
output will be empty. Send me the schema and we'll widen the parser.

#### Optional: route through a residential proxy

DataDome (Airbnb) and Akamai/DataDome (Booking.com) tightened significantly in 2026.
For >~20 saved Airbnb listings or large Booking wishlists, set an `HTTPS_PROXY` env var
before running. Both the Python `pyairbnb` subprocess and the Playwright browser pick
this up automatically:

```bash
export HTTPS_PROXY=http://user:pass@residential-proxy:8000
npm run ingest:airbnb
npm run ingest:booking
```

The Booking ingest always applies a light stealth patch (navigator.webdriver, plugins,
WebGL vendor string, languages, fake chrome.runtime) to the Playwright context. See
[`src/ingest/stealth.ts`](./src/ingest/stealth.ts) for the exact init script.

#### Booking-specific: address-based geocoding fallback

Only ~19% of Booking hotels expose `geo` coordinates in their JSON-LD schema. When the
coordinates are missing, the ingest falls back to **OpenStreetMap Nominatim** geocoding
of the hotel's address (free, rate-limited to 1 request/sec per Nominatim's usage
policy). No setup needed — it's automatic.

### 5. Run

```bash
npm run dev                       # Express API on :3000
npm --workspace web run dev       # Vite dev server on :5173
```

Open <http://localhost:5173>. Click a property pin → side panel slides in → nearest trails populate with driving distance and time (calls cached after first load).

### 6. Discover mode (no login required)

In addition to viewing your saved properties, BackpackerMap can **search Airbnb and Booking.com publicly** without your login or cookies.

1. Click the **Discover OFF** chip in the toolbar (just below the top bar) — it flips to **Discover ON**.
2. The same row expands with date pickers, guest counts, price range, plus collapsible **More** (room types, free cancellation, min bedrooms, min rating) and **Amenities** (~20 curated amenities, meal plans, host types, neighbourhoods freetext) panels.
3. Pan or zoom the map. After a 300ms pause, BackpackerMap searches the visible area via the enabled providers and shows candidate pins (slightly muted style) for properties not already in your wishlist.
4. Click a candidate pin → side panel opens with `★ Save` button. Click it → the candidate is promoted to your wishlist.

**Provider config** (via env vars):

```bash
# Comma-separated list of provider scopes to run (defaults to all)
export SEARCH_PROVIDERS=airbnb,booking

# Add a residential proxy for both providers if DataDome blocks bare requests
export HTTPS_PROXY=http://user:pass@residential.example:8000
```

**Free-by-default**:

- Airbnb uses `pyairbnb.search_all_from_url()` (free, MIT). For >~30 results per search, set `HTTPS_PROXY`.
- Booking.com uses headless Playwright + JSON-LD detail extraction + Nominatim address fallback. Capped at 30 detail fetches per search by default — this value is currently hardcoded in [`src/server/server.ts`](./src/server/server.ts) (`maxDetailFetches: 30`). Edit it there if you need to change the cap; not yet exposed as an env var.

Searches are cached per (bbox, filters, dates) for 10 minutes. Saved properties are persisted in the same `property` table as the wishlist; promoted candidates carry a `promoted_from_candidate_id` link.

## What runs in CI

- Typecheck (root + web)
- ESLint (root + web)
- Unit + integration tests (`vitest`)

What does NOT run in CI:

- Real network calls to Airbnb, Booking.com, or OpenRouteService — fixtures only
- Playwright e2e / visual regression / accessibility (planned for a future pass)

## Troubleshooting

| Symptom                                                                                                  | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dropped a new `.gpx` into `data/trails/` but the map didn't update                                       | `ingest:trails` is not a watcher. Re-run `npm run ingest:trails` (or `npm run ingest:all`) and reload the web app                                                                                                                                                                                                                                                                                                                                                                 |
| Deleted a `.gpx` from disk but the trail is still on the map                                             | `ingest:trails` is insert/update-only; it does not mirror disk. Delete the row manually: `sqlite3 db/backpackermap.sqlite "DELETE FROM trail WHERE id = N;"`                                                                                                                                                                                                                                                                                                                      |
| Trailhead marker is at the summit instead of the road                                                    | Your GPX is reversed — the ingest takes the first track point as the trailhead. Reverse the track in your GPS tool of choice and re-run `ingest:trails`                                                                                                                                                                                                                                                                                                                           |
| `ORS 401 Unauthorized` on first `/api/distance` call                                                     | Your `ORS_API_KEY` in `.env` is empty or wrong; re-copy from the ORS dashboard                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ORS 429 rate limited`                                                                                   | You hit the 40/min or 2,000/day cap; cache makes this rare — wait or check for runaway calls                                                                                                                                                                                                                                                                                                                                                                                      |
| ORS returns `no driving route` / panel shows `— off-road`                                                | The trailhead or property is >350 m from any road. Expected for mountain summits / remote inns; cosmetic-only                                                                                                                                                                                                                                                                                                                                                                     |
| `pyairbnb: ModuleNotFoundError` during `ingest:airbnb`                                                   | Run `python3.10 -m pip install --user pyairbnb` (or the equivalent for your Python ≥3.10)                                                                                                                                                                                                                                                                                                                                                                                         |
| `SyntaxError: invalid syntax` mentioning `match` when pyairbnb is imported                               | Your `python3` is ≤3.9. Install Python 3.10+ and set `PYTHON_BIN=/usr/bin/python3.10` (or equivalent) in `.env`                                                                                                                                                                                                                                                                                                                                                                   |
| `python` / `python3` not on PATH (Windows)                                                               | Re-install Python with "Add to PATH" checked, or set `PYTHON_BIN=C:\path\to\python.exe` in `.env`                                                                                                                                                                                                                                                                                                                                                                                 |
| Airbnb ingest gets empty / CAPTCHA pages                                                                 | DataDome flagged your IP. Set `HTTPS_PROXY` to a residential proxy and retry                                                                                                                                                                                                                                                                                                                                                                                                      |
| Booking ingest immediately fails with "login wall"                                                       | Cookies have expired; re-export from Chrome with Cookie-Editor                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Booking ingest hits a 403 / CAPTCHA at the wishlist page                                                 | Stealth alone wasn't enough. Set `HTTPS_PROXY` to a residential proxy and retry                                                                                                                                                                                                                                                                                                                                                                                                   |
| Booking ingest returns `lat=null, lng=null` for many hotels                                              | Their JSON-LD schema lacks `geo` (only ~19% of hotels have it). The Nominatim fallback will catch most; the rest may need manual coords                                                                                                                                                                                                                                                                                                                                           |
| Discover mode returns no Airbnb results                                                                  | DataDome may be blocking your IP; set `HTTPS_PROXY` to a residential proxy. Also confirm `pyairbnb` is installed (`pip show pyairbnb`)                                                                                                                                                                                                                                                                                                                                            |
| Discover mode returns no Booking results                                                                 | Same — DataDome on Booking is stricter than on Airbnb. Set `HTTPS_PROXY`. Also note default cap is 30 detail-page fetches per search                                                                                                                                                                                                                                                                                                                                              |
| Discover-mode searches are slow (Booking)                                                                | Default is 5s delay × up to 30 hotels (90–150s worst case). Lower the `maxDetailFetches` value in [`src/server/server.ts`](./src/server/server.ts) for shorter searches at the cost of fewer results. Subsequent identical searches are cached for 10 minutes                                                                                                                                                                                                                     |
| `ingest:google` reports `no places parsed — selector may be stale` for every list                        | Google changed the page format. Compare a fresh capture against `tests/fixtures/google/list-rpc.txt`; the parser heuristics in [`src/ingest/google.ts`](./src/ingest/google.ts) may need an update                                                                                                                                                                                                                                                                                |
| `ingest:google` reports `private list — sign-in required`                                                | The Google Maps list is not set to public-shared. Open it on the web, click Share, and confirm "Anyone with the link can view"                                                                                                                                                                                                                                                                                                                                                    |
| `ingest:google` reports `0 places enriched / 3 list(s)` and the page title in failures matches your list | Likely a CAPTCHA / DataDome challenge from Google. Set `HTTPS_PROXY` to a residential proxy. If that also fails, the list may be temporarily blocked; try again later                                                                                                                                                                                                                                                                                                             |
| Playwright fails to launch on macOS Gatekeeper                                                           | `xattr -d com.apple.quarantine ~/Library/Caches/ms-playwright/*/chrome-mac/Chromium.app`                                                                                                                                                                                                                                                                                                                                                                                          |
| Port 3000 already in use                                                                                 | Set `PORT=3737` in `.env` so the API binds to that port. Then start the web dev server with `API_PORT=3737 npm --workspace web run dev` (Vite reads it from the shell env to set up its `/api` proxy)                                                                                                                                                                                                                                                                             |
| Map shows the empty-tent state but you've ingested data                                                  | The web app fell back to `EmptyState` because every `/api/*` call failed silently. Most often the cause is a port mismatch: `.env` has `PORT=3737` (or similar) but Vite was started without `API_PORT=3737`, so its `/api` proxy is hitting `localhost:3000` (default) where some unrelated service is listening. Restart Vite with the matching `API_PORT`. Curl `http://localhost:5173/api/properties` from a terminal — if it isn't a JSON array, your proxy target is wrong. |

## Stack

- **Node 20+ / TypeScript / Express / better-sqlite3** — backend
- **Vite + React 19 + react-leaflet** — frontend
- **Playwright** — Booking ingest + future e2e
- **Python 3.10+ with `pyairbnb`** — Airbnb enrichment
- **OpenRouteService** — driving distance / time
- **Fonts**: Fraunces (display) + Newsreader (body) + IBM Plex Mono (data), self-hosted via `@fontsource`

## Layout

```
src/                       backend (TypeScript)
  db/                      schema + repo + migrations (0001 init, 0002 candidate, 0003 pois)
  ingest/                  gpx, airbnb, booking, google-list, geocode (Nominatim), stealth, CLI
  routing/                 OpenRouteService client + route cache (trails + pois)
  search/                  v2 Discover mode
    providers/             pyairbnb, booking-diy, 3 stubs (apify-airbnb, apify-booking, booking-demand-api)
    canonical.ts           sha1 cache key with bbox rounding
    amenities.ts           20-amenity catalog (Airbnb int + Booking facility codes)
    dispatcher.ts          Promise.allSettled aggregator + dedup
    types.ts               SearchQuery, ProviderResult, SearchProvider
  server/
    app.ts                 createApp(deps) factory
    server.ts              entry point: env wiring + listen()
    routes/search.ts       GET /api/search, POST /candidates/:id/promote
  lib/                     pyairbnb single-listing spawn wrapper
web/                       frontend (Vite + React)
  src/App.tsx              shell
  src/api.ts               typed fetch client
  src/components/          UI components (saved + Discover)
  src/hooks/               useProperties, useTrails, useDistance, useSearch, useSearchFilters
  src/lib/                 pure: formatCoord, formatDistance, formatDuration, haversine,
                           nearestTrails, bboxHysteresis, searchQuery
  src/icons/               inline SVG components
  src/styles/              tokens.css + globals.css + textures.css
scripts/                   pyairbnb_enrich.py + pyairbnb_search.py + their test mocks
tests/
  unit/                    pure-function and provider unit tests
  integration/             supertest-based HTTP and ingest integration tests
  fixtures/                GPX, Airbnb JSON, Booking HTML, ORS JSON
data/                      (gitignored) user-supplied GPX, exports, cookies
db/                        (gitignored) runtime SQLite + WAL/SHM sidecars
.sisyphus/plans/           v1-plan.md, v2-discover.md, google-maps-poi.md — full designs + decisions logs
```

## License

MIT. See [LICENSE](./LICENSE).
