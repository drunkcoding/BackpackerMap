# BackpackerMap

A self-hosted, single-user webapp that combines your saved AllTrails trails, Airbnb properties, Booking.com properties, and Google Maps places on one map — with driving distance and time from each property to each trailhead or POI, and the actual road-snapped route drawn on hover.

Renders in a deliberate "Expedition Field Journal" aesthetic: warm vellum background, OSM tiles softened with a journal filter, rust trail polylines, coral/slate property markers, brass route lines.

## Design target

**Goals**

- Personal, single-user, runs entirely on your laptop
- One map view across four data sources (AllTrails, Airbnb, Booking, Google Maps)
- Driving distance + time + road-snapped route line for every (property, trail/POI) pair
- Free by default — only mandatory external account is OpenRouteService (free tier, 2k req/day)
- Every external call is cached in SQLite so you re-pay only once per pair

**Non-goals**

- Multi-user / multi-tenant / shared cloud instance
- Mobile app
- Real-time updates (ingest is a manual command; the map is a snapshot)
- Hiking-app feature parity with AllTrails (it's a *housing* app that knows about trails)

## Quickstart

The fastest way to see what BackpackerMap looks like is the bundled demo dataset: one real Dolomites trail (Tre Cime di Lavaredo) and one fake property in Cortina d'Ampezzo. No Airbnb, Booking, or Google account required. Full demo flavour requires a free [OpenRouteService](https://openrouteservice.org/dev/#/signup) key (2-minute signup); without it the map still loads but distances and route lines are disabled. See [docs/getting-started.md](./docs/getting-started.md) for the full signup walkthrough.

### Option A — Docker (no Node, no Python on your host)

```bash
git clone <this-repo> backpackermap
cd backpackermap
echo "ORS_API_KEY=your-token-here" > .env
docker compose --env-file .env up --build
```

Open <http://localhost:3000>. The image builds the web bundle, runs `ingest:example`, and serves both the API and the frontend on port 3000. If 3000 is taken on your host: `HOST_PORT=3939 docker compose --env-file .env up --build`.

### Option B — Node only (faster iteration)

```bash
git clone <this-repo> backpackermap
cd backpackermap
npm install
cp .env.example .env       # then edit and paste your ORS_API_KEY
npm run demo               # builds web → loads example → starts single-port server
```

Open <http://localhost:3000>. Same single-port flow as Docker, just running directly on Node.

### What you should see

- Map centred on the Dolomites
- One rust trail polyline tracing the Tre Cime loop
- One coral property pin in Cortina d'Ampezzo
- Click the pin → side panel slides in, lists "Three Peaks of Lavaredo" with driving distance + time
- Hover the trail row → brass route line draws the actual road from Cortina to the trailhead

If the side panel shows `— off-road` instead of a distance, your `ORS_API_KEY` is missing or wrong.

## Using your own data

The demo is intentionally tiny. To load your real AllTrails / Airbnb / Booking / Google Maps data:

- **Setup per source** (where to put files, how to export, what auth is needed): [docs/data-sources.md](./docs/data-sources.md)
- **Ingest commands** (incl. residential proxy and Nominatim fallback): [docs/ingest.md](./docs/ingest.md)
- **Discover mode** (search Airbnb + Booking without logging in): [docs/discover.md](./docs/discover.md)

To remove the example data before ingesting your own:

```bash
sqlite3 db/backpackermap.sqlite "DELETE FROM property WHERE external_id LIKE 'example/%';"
sqlite3 db/backpackermap.sqlite "DELETE FROM trail WHERE external_id LIKE 'example/%';"
```

## Development

`npm run demo` is for showing off. For working on the code you want two terminals with hot-reload:

```bash
npm run dev                  # Express API on :3000
npm run dev:web              # Vite dev server on :5173 with /api proxy
# open http://localhost:5173
```

Useful commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:watch`.

## Stack & layout

- Node 20+, TypeScript, Express, better-sqlite3 (backend)
- Vite + React 19 + react-leaflet (frontend)
- Playwright (Booking + Google Maps ingest)
- Python 3.10+ with `pyairbnb` (Airbnb enrichment)
- OpenRouteService (driving distance), OSM Nominatim (fallback geocoding)

Full directory tree, data flow, and dependency map: [docs/architecture.md](./docs/architecture.md).

## More docs

- [docs/getting-started.md](./docs/getting-started.md) — prerequisites + ORS signup
- [docs/data-sources.md](./docs/data-sources.md) — AllTrails, Airbnb, Booking, Google Maps setup
- [docs/ingest.md](./docs/ingest.md) — ingest commands, proxy, fallback geocoding
- [docs/discover.md](./docs/discover.md) — Discover mode + provider config
- [docs/troubleshooting.md](./docs/troubleshooting.md) — symptom → fix table + CI notes
- [docs/architecture.md](./docs/architecture.md) — layout, stack, data flow
- [examples/quickstart/README.md](./examples/quickstart/README.md) — what's in the demo dataset

## License

MIT. See [LICENSE](./LICENSE).
