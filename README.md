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

Repeat per trail. Ingest is idempotent — you can drop new files anytime and re-run.

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

| Symptom | Fix |
|---|---|
| `ORS 401 Unauthorized` on first `/api/distance` call | Your `ORS_API_KEY` in `.env` is empty or wrong; re-copy from the ORS dashboard |
| `ORS 429 rate limited` | You hit the 40/min or 2,000/day cap; cache makes this rare — wait or check for runaway calls |
| ORS returns `no driving route` / panel shows `— off-road` | The trailhead or property is >350 m from any road. Expected for mountain summits / remote inns; cosmetic-only |
| `pyairbnb: ModuleNotFoundError` during `ingest:airbnb` | Run `python3.10 -m pip install --user pyairbnb` (or the equivalent for your Python ≥3.10) |
| `SyntaxError: invalid syntax` mentioning `match` when pyairbnb is imported | Your `python3` is ≤3.9. Install Python 3.10+ and set `PYTHON_BIN=/usr/bin/python3.10` (or equivalent) in `.env` |
| `python` / `python3` not on PATH (Windows) | Re-install Python with "Add to PATH" checked, or set `PYTHON_BIN=C:\path\to\python.exe` in `.env` |
| Airbnb ingest gets empty / CAPTCHA pages | DataDome flagged your IP. Set `HTTPS_PROXY` to a residential proxy and retry |
| Booking ingest immediately fails with "login wall" | Cookies have expired; re-export from Chrome with Cookie-Editor |
| Booking ingest hits a 403 / CAPTCHA at the wishlist page | Stealth alone wasn't enough. Set `HTTPS_PROXY` to a residential proxy and retry |
| Booking ingest returns `lat=null, lng=null` for many hotels | Their JSON-LD schema lacks `geo` (only ~19% of hotels have it). The Nominatim fallback will catch most; the rest may need manual coords |
| Discover mode returns no Airbnb results | DataDome may be blocking your IP; set `HTTPS_PROXY` to a residential proxy. Also confirm `pyairbnb` is installed (`pip show pyairbnb`) |
| Discover mode returns no Booking results | Same — DataDome on Booking is stricter than on Airbnb. Set `HTTPS_PROXY`. Also note default cap is 30 detail-page fetches per search |
| Discover-mode searches are slow (Booking) | Default is 5s delay × up to 30 hotels (90–150s worst case). Lower the `maxDetailFetches` value in [`src/server/server.ts`](./src/server/server.ts) for shorter searches at the cost of fewer results. Subsequent identical searches are cached for 10 minutes |
| Playwright fails to launch on macOS Gatekeeper | `xattr -d com.apple.quarantine ~/Library/Caches/ms-playwright/*/chrome-mac/Chromium.app` |
| Port 3000 already in use | Set `PORT=3737` in `.env` so the API binds to that port. Then start the web dev server with `API_PORT=3737 npm --workspace web run dev` (Vite reads it from the shell env to set up its `/api` proxy) |

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
  db/                      schema + repo + migrations (0001 init, 0002 candidate)
  ingest/                  gpx, airbnb, booking, geocode (Nominatim), stealth, CLI
  routing/                 OpenRouteService client + distance cache
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
.sisyphus/plans/           v1-plan.md and v2-discover.md — full designs + decisions logs
```

## License

MIT. See [LICENSE](./LICENSE).
