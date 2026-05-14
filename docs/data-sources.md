# Data sources

BackpackerMap ingests from four sources, all optional and independent. You can run with just one — typically trails — and add the rest later.

| Source | Auth needed | Pipeline | Ingest command |
| --- | --- | --- | --- |
| AllTrails GPX | none (manual download) | XML parse | `npm run ingest:trails` |
| Airbnb personal data | yes (request export) | `pyairbnb` enrichment | `npm run ingest:airbnb` |
| Booking.com | yes (cookie export) | Playwright + JSON-LD + Nominatim | `npm run ingest:booking` |
| Google Maps lists | none (public share) | Playwright scrape | `npm run ingest:google` |

For commands, proxy settings, and the all-in-one path see [docs/ingest.md](./ingest.md).

---

## AllTrails GPX

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

### Amend / add / delete a trail

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

---

## Airbnb personal data

1. Log in at <https://www.airbnb.com/account-settings/privacy-and-sharing>
2. **Request your personal data** → JSON → wait for the email (usually within an hour)
3. Download and unzip; place the resulting JSON file at `data/airbnb/personal_data.json`

This file contains your wishlists. The ingest step parses listing IDs from it, then calls `pyairbnb` to enrich each listing with lat/lng, current price, and photo. Python 3.10+ and the `pyairbnb` package are required — see [docs/getting-started.md](./getting-started.md#python-310-only-for-ingestairbnb-and-discover-modes-airbnb-provider).

If your Airbnb export schema doesn't match the parser's assumptions, the `npm run ingest:airbnb -- --dry-run` output will be empty. Send the schema as an issue and we'll widen the parser.

---

## Booking.com cookies

Booking.com has no personal data export, so we use a logged-in Playwright session.

1. Log in at <https://www.booking.com/> in Chrome
2. Install [**Cookie-Editor**](https://chrome.google.com/webstore/detail/cookie-editor) or **EditThisCookie**
3. Click the extension on `booking.com` → Export → **JSON**
4. Save to `data/booking/cookies.json`

Re-export whenever the session expires (the CLI prints a clear "re-export your cookies" message when that happens).

### Address-based geocoding fallback

Only ~19% of Booking hotels expose `geo` coordinates in their JSON-LD schema. When the coordinates are missing, the ingest falls back to **OpenStreetMap Nominatim** geocoding of the hotel's address (free, rate-limited to 1 request/sec per Nominatim's usage policy). No setup needed — it's automatic.

---

## Google Maps saved-place lists (POIs)

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

### Amend / add / delete a list

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

### Showing POI collections on the map

POI collection visibility is per-browser (stored in `localStorage` under `bpm:visiblePoiCollections`) and **defaults to off** — a freshly-ingested collection won't appear on the map until you toggle its chip on in the POI filter row of the side panel. If POIs aren't appearing after a successful `ingest:google`, check the chip state first.
