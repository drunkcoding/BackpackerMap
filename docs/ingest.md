# Ingest

How to load your data into SQLite. The per-source setup steps (where to put files, what auth is needed) live in [docs/data-sources.md](./data-sources.md); this page covers commands, proxy, and the demo loader.

## The demo dataset

```bash
npm run ingest:example
```

Loads the bundled [examples/quickstart/](../examples/quickstart/README.md) — one real Dolomites trail (Tre Cime di Lavaredo) and one fake property in Cortina d'Ampezzo. Idempotent. Used by `npm run demo` and the Docker image.

## Real data

```bash
npm run ingest:all
```

Or step by step (any combination works — they're independent):

```bash
npm run ingest:trails               # GPX files → SQLite
npm run ingest:airbnb -- --dry-run  # preview: list listing IDs/URLs from the export, no API calls
npm run ingest:airbnb               # Airbnb export → pyairbnb → SQLite
npm run ingest:booking              # Playwright wishlist scrape → JSON-LD → SQLite
npm run ingest:google               # Playwright Google Maps list scrape → SQLite
```

Each one is safe to run repeatedly — they upsert by `external_id` and never duplicate rows. Refresh as often as you like; cached driving distances survive as long as the `id` is preserved.

## Where things go

| Default file                     | Override env var       |
| -------------------------------- | ---------------------- |
| `data/trails/*.gpx`              | `TRAILS_DIR`           |
| `data/airbnb/personal_data.json` | `AIRBNB_EXPORT_PATH`   |
| `data/booking/cookies.json`      | `BOOKING_COOKIES_PATH` |
| `data/google/lists.json`         | `GOOGLE_LISTS_PATH`    |
| `db/backpackermap.sqlite`        | `DB_PATH`              |

## Optional: route through a residential proxy

DataDome (Airbnb) and Akamai/DataDome (Booking.com) tightened significantly in 2026. For >~20 saved Airbnb listings or large Booking wishlists, set an `HTTPS_PROXY` env var before running. Both the Python `pyairbnb` subprocess and the Playwright browser pick this up automatically:

```bash
export HTTPS_PROXY=http://user:pass@residential-proxy:8000
npm run ingest:airbnb
npm run ingest:booking
```

The Booking ingest always applies a light stealth patch (navigator.webdriver, plugins, WebGL vendor string, languages, fake chrome.runtime) to the Playwright context. See [`src/ingest/stealth.ts`](../src/ingest/stealth.ts) for the exact init script.

## Booking-specific: address-based geocoding fallback

When Booking's JSON-LD lacks `geo` (most hotels), the ingest falls back to OSM Nominatim. No setup. Details and the ~19% number live in [data-sources.md → Address-based geocoding fallback](./data-sources.md#address-based-geocoding-fallback).

## Removing example data

If you ran `npm run ingest:example` to try the demo and now want a clean slate before ingesting your own data:

```bash
sqlite3 db/backpackermap.sqlite "DELETE FROM property WHERE external_id LIKE 'example/%';"
sqlite3 db/backpackermap.sqlite "DELETE FROM trail WHERE external_id LIKE 'example/%';"
```
