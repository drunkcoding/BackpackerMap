# Discover mode

In addition to viewing your saved properties, BackpackerMap can **search Airbnb and Booking.com publicly** without your login or cookies.

## How to use

1. Click the **Discover OFF** chip in the toolbar (just below the top bar) — it flips to **Discover ON**.
2. The same row expands with date pickers, guest counts, price range, plus collapsible **More** (room types, free cancellation, min bedrooms, min rating) and **Amenities** (~20 curated amenities, meal plans, host types, neighbourhoods freetext) panels.
3. Pan or zoom the map. After a 300ms pause, BackpackerMap searches the visible area via the enabled providers and shows candidate pins (slightly muted style) for properties not already in your wishlist.
4. Click a candidate pin → side panel opens with `★ Save` button. Click it → the candidate is promoted to your wishlist.

## Provider config

```bash
# Comma-separated list of provider scopes to run. Valid values: airbnb, booking.
# Default = both (i.e. equivalent to the line below).
export SEARCH_PROVIDERS=airbnb,booking

# Add a residential proxy for both providers if DataDome blocks bare requests
export HTTPS_PROXY=http://user:pass@residential.example:8000
```

## Free-by-default

- **Airbnb** uses `pyairbnb.search_all_from_url()` (free, MIT). For >~30 results per search, set `HTTPS_PROXY`.
- **Booking.com** uses headless Playwright + JSON-LD detail extraction + Nominatim address fallback. Has a hard detail-fetch cap — see [Why so slow on Booking?](#why-so-slow-on-booking) below for the exact numbers and how to change them.

## Caching

Searches are cached per (bbox, filters, dates) for 10 minutes. Saved properties are persisted in the same `property` table as the wishlist; promoted candidates carry a `promoted_from_candidate_id` link back to the candidate row.

## Why so slow on Booking?

Two hardcoded values in [`src/server/server.ts`](../src/server/server.ts) govern Booking search timing:

| Constant            | Default | Effect                                                              |
| ------------------- | ------- | ------------------------------------------------------------------- |
| `maxDetailFetches`  | `30`    | Cap on per-search detail-page fetches (top-level Discover requests) |
| `perRequestDelayMs` | `5_000` | Between-fetch delay; Booking blocks rapid-fire detail loads         |

Worst case: `5s × 30 = 150s`; typical: 90-150s. List-mode reduces this (`maxDetailFetches: 8`, `perRequestDelayMs: 1500`, `concurrency: 3`).

Lower `maxDetailFetches` for shorter searches at the cost of fewer results — neither value is yet env-var-driven, so it's an edit-and-restart change. The 10-minute search cache means identical follow-up searches are instant regardless.
