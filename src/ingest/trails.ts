import { isAbsolute, resolve } from 'node:path';
import fg from 'fast-glob';
import type { Database } from 'better-sqlite3';
import { getOrCreateSource, upsertTrail } from '../db/repo.ts';
import { parseGpxFile } from './gpx.ts';

export interface IngestTrailsResult {
  ingested: number;
  errors: Array<{ path: string; message: string }>;
}

const DEFAULT_IGNORE = ['**/node_modules/**', '**/.git/**', '**/.venv/**', '**/.svn/**'];

export async function ingestTrails(
  trailsDir: string,
  db: Database,
): Promise<IngestTrailsResult> {
  const absDir = isAbsolute(trailsDir) ? trailsDir : resolve(process.cwd(), trailsDir);

  const files = await fg('**/*.gpx', {
    cwd: absDir,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: DEFAULT_IGNORE,
    caseSensitiveMatch: false,
  });

  const sourceId = getOrCreateSource(db, 'alltrails');
  const errors: IngestTrailsResult['errors'] = [];
  let ingested = 0;

  for (const file of files) {
    try {
      const input = parseGpxFile(file, absDir, sourceId);
      upsertTrail(db, input);
      ingested++;
    } catch (err) {
      errors.push({
        path: file,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { ingested, errors };
}
