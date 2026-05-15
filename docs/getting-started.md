# Getting started

Prerequisites and accounts you need before running any of the [Quickstart](../README.md#quickstart) flows.

## Prerequisites

|                       | Minimal demo (`npm run demo` or `docker compose up`) | Full setup (your own data)            |
| --------------------- | ---------------------------------------------------- | ------------------------------------- |
| Node 20+              | ✅ for `npm run demo` only                           | ✅                                    |
| Docker                | ✅ for `docker compose up` only                      | optional                              |
| Python 3.10+          | not needed                                           | ✅ (for Airbnb enrichment)            |
| Playwright + Chromium | not needed                                           | ✅ (for Booking + Google Maps scrape) |
| ORS API key           | ✅ for driving distance + route line                 | ✅                                    |

The demo path deliberately avoids Python and Playwright so a fresh checkout works on any machine with Node (or just Docker). All of those are only needed once you start ingesting from real Airbnb / Booking / Google Maps sources.

### Node 20+

Install from [nodejs.org](https://nodejs.org/) or via your package manager / `nvm`. Check with `node --version`.

### Python 3.10+ (only for `ingest:airbnb` and Discover mode's Airbnb provider)

`pyairbnb` uses Python's `match` statement and will fail to import on Python ≤3.9 **even though `pip install` succeeds**. This is the single most common footgun.

```bash
python3 --version   # must print 3.10 or higher
```

If your default `python3` is 3.9 (common on Anaconda / older Ubuntu / macOS system Python), install 3.10+ separately and point `PYTHON_BIN` at it in `.env`:

- Linux: `PYTHON_BIN=/usr/bin/python3.10`
- macOS (Homebrew): `PYTHON_BIN=/opt/homebrew/bin/python3.10`
- Windows: `PYTHON_BIN=C:\Python310\python.exe`

Then install `pyairbnb` for that Python:

```bash
python3.10 -m pip install --user pyairbnb
python3.10 -c "import pyairbnb; print('ok')"   # verify
```

### Playwright (only for `ingest:booking`, `ingest:google`, and Discover mode's Booking provider)

```bash
npx playwright install chromium
```

This downloads ~350 MB and is skipped on the demo path.

## Get an OpenRouteService API key

BackpackerMap uses [OpenRouteService](https://openrouteservice.org/) (ORS) for driving distance and time between properties and trails/POIs, plus the actual road-snapped route line drawn on the map. The free tier is enough for personal use, and every result is cached in SQLite — so once a (property, trail) pair has been computed, ORS is never called again for that pair.

1. Go to <https://openrouteservice.org/dev/#/signup>
2. Sign up (email + password, no card required)
3. Confirm email → open the dashboard → create a free-tier token
4. Copy the token into `.env`:
   ```env
   ORS_API_KEY=eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDF...
   ```

**Free-tier limits**: 2,000 directions/day, 40 requests/minute. Easily enough for personal use; the cache means you re-pay only once per (property, trail) pair.

### Running without an ORS key

The app still loads — pins and trail polylines render — but the side panel shows `— off-road` for every distance and no route line draws on hover. The demo is much less interesting without it, so we recommend the 2-minute signup.

## `.env` setup

```bash
cp .env.example .env       # bash / zsh / git-bash
# OR on PowerShell:
# Copy-Item .env.example .env
```

Minimum keys:

| Key           | Why                                                               | Default                               |
| ------------- | ----------------------------------------------------------------- | ------------------------------------- |
| `ORS_API_KEY` | driving distance + route line                                     | (empty — `/api/distance` returns 502) |
| `PYTHON_BIN`  | absolute path to Python ≥3.10, if your default `python3` is older | `python3`                             |

Optional keys are listed in [`.env.example`](../.env.example) and explained inline. The ones you're most likely to set: `PORT` (default `3000`), `HTTPS_PROXY` (residential proxy for Airbnb / Booking ingest — see [docs/ingest.md](./ingest.md#optional-route-through-a-residential-proxy)), `SEARCH_PROVIDERS` (Discover mode — see [docs/discover.md](./discover.md)).

## Next steps

- Try the demo: [Quickstart](../README.md#quickstart) in the project README
- Add your own AllTrails / Airbnb / Booking / Google Maps data: [docs/data-sources.md](./data-sources.md)
- Run the ingest commands: [docs/ingest.md](./ingest.md)
- Search Airbnb + Booking without logging in: [docs/discover.md](./discover.md)
- Something broken: [docs/troubleshooting.md](./troubleshooting.md)
