/**
 * ingest:example — load the bundled examples/quickstart/ dataset into SQLite.
 *
 * This is the demo / fresh-user entry point. It seeds:
 *   - 1 trail (Tre Cime di Lavaredo, Dolomites) from examples/quickstart/trails/
 *   - 1 fake property (Cortina d'Ampezzo test cabin) from examples/quickstart/properties/properties.json
 *
 * Idempotent: re-running upserts on the example-prefixed external_ids. Existing
 * real data (from npm run ingest:trails / ingest:airbnb / etc.) is never touched.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';
import { getOrCreateSource, openDb, upsertProperty, upsertTrail } from '../src/db/repo.ts';
import { parseGpx } from '../src/ingest/gpx.ts';

interface ExampleProperty {
  external_id: string;
  provider: 'airbnb' | 'booking';
  name: string;
  url: string;
  lat: number;
  lng: number;
  price_label: string | null;
  photo_url: string | null;
}

interface ExamplePropertiesFile {
  properties: ExampleProperty[];
}

const EXAMPLE_ROOT = resolve(process.cwd(), 'examples/quickstart');
const EXAMPLE_TRAILS_DIR = resolve(EXAMPLE_ROOT, 'trails');
const EXAMPLE_PROPERTIES_FILE = resolve(EXAMPLE_ROOT, 'properties/properties.json');

async function main(): Promise<void> {
  const dbPath = resolve(process.cwd(), process.env['DB_PATH'] ?? './db/backpackermap.sqlite');
  console.log(`[ingest:example] using db at ${dbPath}`);
  const db = openDb(dbPath);

  try {
    const trailsSourceId = getOrCreateSource(db, 'alltrails');
    const gpxFiles = await fg('**/*.gpx', {
      cwd: EXAMPLE_TRAILS_DIR,
      absolute: true,
      onlyFiles: true,
      caseSensitiveMatch: false,
    });

    let trailsIngested = 0;
    for (const file of gpxFiles) {
      const xml = readFileSync(file, 'utf8');
      const parsed = parseGpx(xml);
      // Prefix with "example/" so it never collides with real ingest:trails output,
      // and so users can spot + delete example data with a single SQL filter.
      const relPath = file.slice(EXAMPLE_TRAILS_DIR.length + 1).replace(/\\/g, '/');
      const externalId = `example/${relPath}`;
      upsertTrail(db, {
        sourceId: trailsSourceId,
        externalId,
        name: parsed.name,
        trailheadLat: parsed.trailheadLat,
        trailheadLng: parsed.trailheadLng,
        lengthMeters: parsed.lengthMeters,
        elevationGainMeters: parsed.elevationGainMeters,
        geojson: parsed.geojson,
        rawPath: file,
      });
      trailsIngested++;
      console.log(
        `[ingest:example]   trail "${parsed.name}" (${(parsed.lengthMeters / 1000).toFixed(1)} km) → ${externalId}`,
      );
    }

    const raw = readFileSync(EXAMPLE_PROPERTIES_FILE, 'utf8');
    const parsedJson = JSON.parse(raw) as ExamplePropertiesFile;
    if (!Array.isArray(parsedJson.properties)) {
      throw new Error(`examples/quickstart/properties/properties.json: missing "properties" array`);
    }

    let propertiesIngested = 0;
    for (const p of parsedJson.properties) {
      const propertySourceId = getOrCreateSource(db, p.provider);
      upsertProperty(db, {
        sourceId: propertySourceId,
        provider: p.provider,
        externalId: p.external_id,
        name: p.name,
        url: p.url,
        lat: p.lat,
        lng: p.lng,
        priceLabel: p.price_label,
        photoUrl: p.photo_url,
        rawJson: JSON.stringify({ source: 'examples/quickstart', ...p }),
        enrichedAt: new Date().toISOString(),
      });
      propertiesIngested++;
      console.log(`[ingest:example]   property "${p.name}" @ ${p.lat},${p.lng} → ${p.external_id}`);
    }

    console.log(
      `[ingest:example] done. ${trailsIngested} trail(s), ${propertiesIngested} property(ies).`,
    );
    console.log(`[ingest:example] next: npm run demo  (or npm run dev + npm run dev:web)`);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
