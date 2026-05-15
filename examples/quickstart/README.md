# Example dataset — Tre Cime di Lavaredo

A small, self-contained dataset for trying BackpackerMap without registering with AllTrails, Airbnb, Booking.com, or Google Maps. Loaded by `npm run ingest:example` (and automatically by `npm run demo` and the Docker image).

## What's in here

```
examples/quickstart/
  trails/tre-cime-di-lavaredo.gpx     # Real AllTrails export of "Three Peaks of Lavaredo"
                                      # Trailhead: 46.6184, 12.31211 (Dolomites, Italy)
                                      # ~1,265 trackpoints → ~10 km loop
  properties/properties.json          # 1 fake property at Cortina d'Ampezzo
                                      # name: "Cortina d'Ampezzo test cabin (example)"
                                      # coords: 46.5395, 12.1352 (~25 km SW of the trailhead)
                                      # provider: "airbnb" (pin colour only — not a real listing)
                                      # external_id: "example/cortina-cabin"
```

## What you'll see in the app

After `npm run ingest:example`:

- One **trail polyline** (rust line) tracing the Tre Cime loop in the Dolomites
- One **property pin** (coral marker) at Cortina d'Ampezzo
- Click the property pin → side panel slides in, lists "Three Peaks of Lavaredo" with the driving distance + time from Cortina to the trailhead
- Hover the trail row → brass route line draws the actual road-snapped driving path on the map

Driving distance and the route line require `ORS_API_KEY` — see [docs/getting-started.md](../../docs/getting-started.md#get-an-openrouteservice-api-key). Without it, the property pin still renders but the side panel shows `— off-road` for every trail.

## Identifiers

The example data uses prefixed external IDs (`example/...`) so it can sit alongside any real data you ingest later:

| Table      | Real-ingest external_id                                   | Example external_id                |
| ---------- | --------------------------------------------------------- | ---------------------------------- |
| `trail`    | `cairngorms/loch-an-eilein.gpx` (path under `TRAILS_DIR`) | `example/tre-cime-di-lavaredo.gpx` |
| `property` | `12345` (Airbnb listing ID)                               | `example/cortina-cabin`            |

Re-running `npm run ingest:example` is idempotent: it upserts on these external IDs.

## Removing the example data

See [docs/ingest.md → Removing example data](../../docs/ingest.md#removing-example-data) (uses a `LIKE 'example/%'` wildcard so it covers any future demo rows too).

## Attribution

`trails/tre-cime-di-lavaredo.gpx` is a real GPX export from <https://www.alltrails.com/>. Track data is © OpenStreetMap contributors via AllTrails' import pipeline. The Cortina property is fictitious.
