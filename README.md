# BackpackerMap

A self-hosted, single-user webapp that combines your saved AllTrails trails, Airbnb properties, and Booking.com properties on one map — with driving distance and time from each property to each trailhead.

Map renders in a deliberate "Expedition Field Journal" aesthetic: warm vellum background, OSM tiles softened with a journal filter, rust trail polylines, coral/slate property markers, brass dashed connection lines when you hover a trail row in the side panel.

## Quickstart

### 0. Prerequisites

- **Node.js 20+** ([nodejs.org](https://nodejs.org/))
- **Python 3.10+** (needed for the Airbnb enrichment step; macOS/Linux have it pre-installed, Windows users install from [python.org](https://www.python.org/downloads/))
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
npx playwright install chromium          # for Booking.com ingest
pip install pyairbnb                      # for Airbnb enrichment (or pip3)
```

### 2. Configure

```bash
cp .env.example .env       # bash / zsh / git-bash
# OR on PowerShell:
# Copy-Item .env.example .env
```

Open `.env` and paste your `ORS_API_KEY`.

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

The Booking ingest also applies a light stealth patch (navigator.webdriver, plugins,
WebGL vendor string, etc.) to the Playwright context by default. Disable with
`BOOKING_STEALTH=0` if you want to debug raw responses.

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

1. Click the **Discover OFF** toggle in the top bar — it flips to **Discover ON**.
2. A filter row appears with date pickers, guest counts, price range, room types, amenities (~20 curated), meal plans, host types.
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
- Booking.com uses headless Playwright + JSON-LD detail extraction + Nominatim address fallback. Capped at 30 detail fetches per search by default (`maxDetailFetches`) to stay below DataDome's tolerance.

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
| `pyairbnb: ModuleNotFoundError` during `ingest:airbnb` | Run `pip install pyairbnb` (or `pip3` / `python -m pip`) |
| `python` / `python3` not on PATH (Windows) | Re-install Python with "Add to PATH" checked, or set `PYTHON_BIN=C:\path\to\python.exe` in `.env` |
| Airbnb ingest gets empty / CAPTCHA pages | DataDome flagged your IP. Set `HTTPS_PROXY` to a residential proxy and retry |
| Booking ingest immediately fails with "login wall" | Cookies have expired; re-export from Chrome with Cookie-Editor |
| Booking ingest hits a 403 / CAPTCHA at the wishlist page | Stealth alone wasn't enough. Set `HTTPS_PROXY` to a residential proxy and retry |
| Booking ingest returns `lat=null, lng=null` for many hotels | Their JSON-LD schema lacks `geo` (only ~19% of hotels have it). The Nominatim fallback will catch most; the rest may need manual coords |
| Discover mode returns no Airbnb results | DataDome may be blocking your IP; set `HTTPS_PROXY` to a residential proxy. Also confirm `pyairbnb` is installed (`pip show pyairbnb`) |
| Discover mode returns no Booking results | Same — DataDome on Booking is stricter than on Airbnb. Set `HTTPS_PROXY`. Also note default cap is 30 detail-page fetches per search |
| Discover-mode searches are slow (Booking) | Per-detail-page fetch is 5s delay × N hotels. Lower `maxDetailFetches` (env var TBD) or accept the latency. Subsequent identical searches are cached for 10 minutes |
| Playwright fails to launch on macOS Gatekeeper | `xattr -d com.apple.quarantine ~/Library/Caches/ms-playwright/*/chrome-mac/Chromium.app` |
| Port 3000 already in use | Set `PORT=3737` in `.env` and update the Vite proxy via `API_PORT=3737` env when starting `npm --workspace web run dev` |

## Stack

- **Node 20+ / TypeScript / Express / better-sqlite3** — backend
- **Vite + React 19 + react-leaflet** — frontend
- **Playwright** — Booking ingest + future e2e
- **Python 3.10+ with `pyairbnb`** — Airbnb enrichment
- **OpenRouteService** — driving distance / time
- **Fonts**: Fraunces (display) + Newsreader (body) + IBM Plex Mono (data), self-hosted via `@fontsource`

## Layout

```
src/              backend (TypeScript)
  db/             schema + repo + migrations
  ingest/         gpx, airbnb, booking + CLI dispatcher
  routing/        OpenRouteService client + cache
  server/         Express app factory + entry point
  lib/            pyairbnb spawn wrapper
web/              frontend (Vite + React)
  src/components/ UI components
  src/hooks/      data hooks
  src/lib/        pure formatters + geo utils
  src/icons/      inline SVG components
  src/styles/     tokens.css + globals.css + textures.css
scripts/          pyairbnb_enrich.py + mock for tests
tests/            unit / integration (backend)
data/             (gitignored) user-supplied GPX, exports, cookies
db/               (gitignored) runtime SQLite
.sisyphus/plans/  v1-plan.md — full design + decisions log
```

## License

MIT. See [LICENSE](./LICENSE).
