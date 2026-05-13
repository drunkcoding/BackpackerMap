import { resolve } from 'node:path';
import { openDb } from '../db/repo.ts';
import { ingestTrails } from './trails.ts';
import { dryRunAirbnb, ingestAirbnb } from './airbnb.ts';
import { ingestBooking } from './booking.ts';

interface Env {
  TRAILS_DIR: string;
  AIRBNB_EXPORT_PATH: string;
  BOOKING_COOKIES_PATH: string;
  DB_PATH: string;
}

function loadEnv(): Env {
  return {
    TRAILS_DIR: process.env['TRAILS_DIR'] ?? './data/trails',
    AIRBNB_EXPORT_PATH: process.env['AIRBNB_EXPORT_PATH'] ?? './data/airbnb/personal_data.json',
    BOOKING_COOKIES_PATH: process.env['BOOKING_COOKIES_PATH'] ?? './data/booking/cookies.json',
    DB_PATH: process.env['DB_PATH'] ?? './db/backpackermap.sqlite',
  };
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!command) {
    console.error('Usage: ingest <trails|airbnb|booking>');
    process.exit(1);
  }

  const env = loadEnv();
  const dbPath = resolve(process.cwd(), env.DB_PATH);
  const db = openDb(dbPath);

  try {
    switch (command) {
      case 'trails': {
        const dir = resolve(process.cwd(), env.TRAILS_DIR);
        console.log(`[ingest:trails] scanning ${dir} recursively for *.gpx`);
        const result = await ingestTrails(dir, db);
        console.log(`[ingest:trails] ingested ${result.ingested} trails`);
        if (result.errors.length > 0) {
          console.log(`[ingest:trails] ${result.errors.length} error(s):`);
          for (const e of result.errors) {
            console.log(`  - ${e.path}: ${e.message}`);
          }
          process.exitCode = result.ingested === 0 ? 1 : 0;
        }
        break;
      }
      case 'airbnb': {
        const exportPath = resolve(process.cwd(), env.AIRBNB_EXPORT_PATH);
        const dryRun = process.argv.includes('--dry-run');
        if (dryRun) {
          console.log(`[ingest:airbnb] DRY-RUN reading export from ${exportPath}`);
          const dr = dryRunAirbnb(exportPath);
          console.log(`[ingest:airbnb] found ${dr.total} listing reference(s):`);
          for (const r of dr.refs) console.log(`  - ${r.id} ${r.url}`);
          break;
        }
        console.log(`[ingest:airbnb] reading export from ${exportPath}`);
        const result = await ingestAirbnb(exportPath, db);
        console.log(
          `[ingest:airbnb] enriched ${result.enriched}/${result.total} listings`,
        );
        if (result.failed.length > 0) {
          console.log(`[ingest:airbnb] ${result.failed.length} failure(s):`);
          for (const f of result.failed) {
            console.log(`  - ${f.url}: ${f.message}`);
          }
          if (result.enriched === 0) process.exitCode = 1;
        }
        break;
      }
      case 'booking': {
        const cookiesPath = resolve(process.cwd(), env.BOOKING_COOKIES_PATH);
        console.log(`[ingest:booking] using cookies from ${cookiesPath}`);
        const result = await ingestBooking(db, { cookiesPath });
        console.log(
          `[ingest:booking] enriched ${result.enriched}/${result.total} hotels`,
        );
        if (result.failed.length > 0) {
          console.log(`[ingest:booking] ${result.failed.length} failure(s):`);
          for (const f of result.failed) {
            console.log(`  - ${f.url}: ${f.message}`);
          }
          if (result.enriched === 0) process.exitCode = 1;
        }
        break;
      }
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
