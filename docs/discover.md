# Discover mode

In addition to viewing your saved properties, BackpackerMap can **search Airbnb and Booking.com publicly** without your login or cookies.

## How to use

1. Click the **Discover OFF** chip in the toolbar (just below the top bar) — it flips to **Discover ON**.
2. The same row expands with date pickers, guest counts, price range, plus collapsible **More** (room types, free cancellation, min bedrooms, min rating) and **Amenities** (~20 curated amenities, meal plans, host types, neighbourhoods freetext) panels.
3. Pan or zoom the map. After a 300ms pause, BackpackerMap searches the visible area via the enabled providers and shows candidate pins (slightly muted style) for properties not already in your wishlist.
4. Click a candidate pin → side panel opens with `★ Save` button. Click it → the candidate is promoted to your wishlist.

## Provider config

```bash
# Comma-separated list of provider scopes to run (defaults to all)
export SEARCH_PROVIDERS=airbnb,booking

# Add a residential proxy for both providers if DataDome blocks bare requests
export HTTPS_PROXY=http://user:pass@residential.example:8000
```

## Free-by-default

- **Airbnb** uses `pyairbnb.search_all_from_url()` (free, MIT). For >~30 results per search, set `HTTPS_PROXY`.
- **Booking.com** uses headless Playwright + JSON-LD detail extraction + Nominatim address fallback. Capped at 30 detail fetches per search by default — this value is currently hardcoded in [`src/server/server.ts`](../src/server/server.ts) (`maxDetailFetches: 30`). Edit it there if you need to change the cap; not yet exposed as an env var.

## Caching

Searches are cached per (bbox, filters, dates) for 10 minutes. Saved properties are persisted in the same `property` table as the wishlist; promoted candidates carry a `promoted_from_candidate_id` link back to the candidate row.

## Why so slow on Booking?

Default is 5s delay × up to 30 hotels (90–150s worst case). The delay exists because Booking aggressively blocks rapid-fire detail-page fetches. Lower the `maxDetailFetches` in [`src/server/server.ts`](../src/server/server.ts) for shorter searches at the cost of fewer results. Subsequent identical searches are served from the 10-minute cache.
