import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from 'better-sqlite3';
import { openDb, listPois, listPoisByCollection } from '../../src/db/repo.ts';
import { ingestGoogle, type FetchedList, type ListFetcher } from '../../src/ingest/google-list.ts';

const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'google');

function fetcherFromMap(map: Map<string, FetchedList>): ListFetcher {
  return async (url: string) => {
    const v = map.get(url);
    if (!v) throw new Error(`no fixture for url ${url}`);
    return v;
  };
}

function rpcFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8');
}

describe('ingestGoogle (integration)', () => {
  let db: Database;

  beforeEach(() => {
    db = openDb(':memory:');
  });
  afterEach(() => db.close());

  it('ingests 3 places from a single list with explicit collection name', async () => {
    const url = 'https://maps.app.goo.gl/example1';
    const map = new Map<string, FetchedList>();
    map.set(url, {
      url,
      finalUrl: url,
      pageTitle: 'Scotland Trip 2026 - Google Maps',
      rpcBodies: [rpcFixture('list-rpc.txt')],
    });

    const result = await ingestGoogle(db, {
      lists: [{ url, name: 'Scotland 2026' }],
      fetcher: fetcherFromMap(map),
      perListDelayMs: 0,
    });

    expect(result.totalLists).toBe(1);
    expect(result.enriched).toBe(3);
    expect(result.failed).toEqual([]);

    const pois = listPois(db);
    expect(pois).toHaveLength(3);
    expect(pois.every((p) => p.collection === 'Scotland 2026')).toBe(true);
  });

  it('derives collection name from page title when not provided', async () => {
    const url = 'https://maps.app.goo.gl/example2';
    const map = new Map<string, FetchedList>();
    map.set(url, {
      url,
      finalUrl: url,
      pageTitle: 'Scotland Trip 2026 - Google Maps',
      rpcBodies: [rpcFixture('list-rpc.txt')],
    });

    await ingestGoogle(db, {
      lists: [{ url }],
      fetcher: fetcherFromMap(map),
      perListDelayMs: 0,
    });

    expect(listPoisByCollection(db, 'Scotland Trip 2026')).toHaveLength(3);
  });

  it('processes two lists; place_id-keyed places collapse to last collection, hash-keyed places keep both', async () => {
    const url1 = 'https://maps.app.goo.gl/example3';
    const url2 = 'https://maps.app.goo.gl/example4';
    const map = new Map<string, FetchedList>();
    map.set(url1, {
      url: url1,
      finalUrl: url1,
      pageTitle: 'List A - Google Maps',
      rpcBodies: [rpcFixture('list-rpc.txt')],
    });
    map.set(url2, {
      url: url2,
      finalUrl: url2,
      pageTitle: 'List B - Google Maps',
      rpcBodies: [rpcFixture('list-rpc.txt')],
    });

    const result = await ingestGoogle(db, {
      lists: [{ url: url1 }, { url: url2 }],
      fetcher: fetcherFromMap(map),
      perListDelayMs: 0,
    });

    expect(result.totalLists).toBe(2);
    expect(result.enriched).toBe(6);

    // Fixture has 2 places with place_id (collapsed) + 1 place without place_id
    // (uses hash external_id that includes collection; appears once per list).
    expect(listPois(db)).toHaveLength(4);
    expect(listPoisByCollection(db, 'List A')).toHaveLength(1);
    expect(listPoisByCollection(db, 'List B')).toHaveLength(3);
  });

  it('is idempotent: re-ingesting the same list keeps the row count constant', async () => {
    const url = 'https://maps.app.goo.gl/example5';
    const map = new Map<string, FetchedList>();
    map.set(url, {
      url,
      finalUrl: url,
      pageTitle: 'Trip - Google Maps',
      rpcBodies: [rpcFixture('list-rpc.txt')],
    });

    await ingestGoogle(db, {
      lists: [{ url, name: 'Trip' }],
      fetcher: fetcherFromMap(map),
      perListDelayMs: 0,
    });
    expect(listPois(db)).toHaveLength(3);

    await ingestGoogle(db, {
      lists: [{ url, name: 'Trip' }],
      fetcher: fetcherFromMap(map),
      perListDelayMs: 0,
    });
    expect(listPois(db)).toHaveLength(3);
  });

  it('reports failure when private list RPC yields no places', async () => {
    const url = 'https://maps.app.goo.gl/private-list';
    const map = new Map<string, FetchedList>();
    map.set(url, {
      url,
      finalUrl: url,
      pageTitle: 'Private list',
      rpcBodies: [rpcFixture('private-list-rpc.txt')],
    });

    const result = await ingestGoogle(db, {
      lists: [{ url }],
      fetcher: fetcherFromMap(map),
      perListDelayMs: 0,
    });

    expect(result.enriched).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.url).toBe(url);
    expect(result.failed[0]!.message).toMatch(/no places parsed/);
  });

  it('reports failure when page title indicates sign-in wall', async () => {
    const url = 'https://maps.app.goo.gl/signin';
    const map = new Map<string, FetchedList>();
    map.set(url, {
      url,
      finalUrl: url,
      pageTitle: 'Sign in - Google Accounts',
      rpcBodies: [rpcFixture('private-list-rpc.txt')],
    });

    const result = await ingestGoogle(db, {
      lists: [{ url }],
      fetcher: fetcherFromMap(map),
      perListDelayMs: 0,
    });

    expect(result.enriched).toBe(0);
    expect(result.failed[0]!.message).toMatch(/sign-in required/);
  });

  it('mirrors Google: re-ingest after a removal deletes the missing place', async () => {
    const url = 'https://maps.app.goo.gl/mirror-test';
    const map = new Map<string, FetchedList>();
    map.set(url, {
      url,
      finalUrl: url,
      pageTitle: 'Trip - Google Maps',
      rpcBodies: [rpcFixture('list-rpc.txt')],
    });

    const firstRun = await ingestGoogle(db, {
      lists: [{ url, name: 'Trip' }],
      fetcher: fetcherFromMap(map),
      perListDelayMs: 0,
    });
    expect(firstRun.enriched).toBe(3);
    expect(firstRun.removed).toBe(0);
    expect(listPois(db)).toHaveLength(3);

    const filtered = rpcFixture('list-rpc.txt').replace(
      /,\[null,null,\[\\"Falls of Falloch viewpoint[\s\S]*?\]\]/,
      '',
    );
    map.set(url, {
      url,
      finalUrl: url,
      pageTitle: 'Trip - Google Maps',
      rpcBodies: [filtered],
    });

    const secondRun = await ingestGoogle(db, {
      lists: [{ url, name: 'Trip' }],
      fetcher: fetcherFromMap(map),
      perListDelayMs: 0,
    });
    expect(secondRun.enriched).toBe(2);
    expect(secondRun.removed).toBe(1);

    const remaining = listPois(db);
    expect(remaining).toHaveLength(2);
    expect(remaining.map((p) => p.name).sort()).toEqual(['Loch Lomond Shore', 'The Drovers Inn']);
  });

  it('mirrors Google: cleans up route_cache rows for removed POIs', async () => {
    const url = 'https://maps.app.goo.gl/cache-cleanup';
    const map = new Map<string, FetchedList>();
    map.set(url, {
      url,
      finalUrl: url,
      pageTitle: 'Trip - Google Maps',
      rpcBodies: [rpcFixture('list-rpc.txt')],
    });

    await ingestGoogle(db, {
      lists: [{ url, name: 'Trip' }],
      fetcher: fetcherFromMap(map),
      perListDelayMs: 0,
    });

    db.exec(`INSERT INTO source (kind) VALUES ('airbnb')`);
    const propStmt = db.prepare(`
      INSERT INTO property (source_id, provider, external_id, name, url, lat, lng, raw_json)
      VALUES (?, 'airbnb', 'p1', 'Test', 'https://example.com', 56.0, -4.5, '{}')
      RETURNING id
    `);
    const propRow = propStmt.get(
      db.prepare<[], { id: number }>("SELECT id FROM source WHERE kind='airbnb' LIMIT 1").get()!.id,
    ) as { id: number };

    const pois = listPois(db);
    const falls = pois.find((p) => p.name === 'Falls of Falloch viewpoint')!;
    db.prepare(
      `INSERT INTO route_cache (property_id, target_kind, target_id, meters, seconds)
       VALUES (?, 'poi', ?, 12000, 900)`,
    ).run(propRow.id, falls.id);
    expect(
      db
        .prepare<
          [number, string, number],
          { c: number }
        >('SELECT COUNT(*) AS c FROM route_cache WHERE property_id = ? AND target_kind = ? AND target_id = ?')
        .get(propRow.id, 'poi', falls.id)?.c,
    ).toBe(1);

    const partialBody = rpcFixture('list-rpc.txt').replace(
      /,\[null,null,\[\\"Falls of Falloch viewpoint[\s\S]*?\]\]/,
      '',
    );
    map.set(url, {
      url,
      finalUrl: url,
      pageTitle: 'Trip - Google Maps',
      rpcBodies: [partialBody],
    });
    await ingestGoogle(db, {
      lists: [{ url, name: 'Trip' }],
      fetcher: fetcherFromMap(map),
      perListDelayMs: 0,
    });

    expect(
      db
        .prepare<
          [number, string, number],
          { c: number }
        >('SELECT COUNT(*) AS c FROM route_cache WHERE property_id = ? AND target_kind = ? AND target_id = ?')
        .get(propRow.id, 'poi', falls.id)?.c,
    ).toBe(0);
  });

  it('mirrors Google: removal in one collection does NOT touch other collections', async () => {
    const urlA = 'https://maps.app.goo.gl/coll-a';
    const urlB = 'https://maps.app.goo.gl/coll-b';
    const map = new Map<string, FetchedList>();
    map.set(urlA, {
      url: urlA,
      finalUrl: urlA,
      pageTitle: 'Collection A - Google Maps',
      rpcBodies: [rpcFixture('list-rpc.txt')],
    });
    map.set(urlB, {
      url: urlB,
      finalUrl: urlB,
      pageTitle: 'Collection B - Google Maps',
      rpcBodies: [rpcFixture('list-rpc.txt')],
    });

    await ingestGoogle(db, {
      lists: [
        { url: urlA, name: 'A' },
        { url: urlB, name: 'B' },
      ],
      fetcher: fetcherFromMap(map),
      perListDelayMs: 0,
    });
    const aBefore = listPoisByCollection(db, 'A').length;
    expect(aBefore).toBeGreaterThan(0);

    const partialB = rpcFixture('list-rpc.txt').replace(
      /,\[null,null,\[\\"Falls of Falloch viewpoint[\s\S]*?\]\]/,
      '',
    );
    map.set(urlB, {
      url: urlB,
      finalUrl: urlB,
      pageTitle: 'Collection B - Google Maps',
      rpcBodies: [partialB],
    });

    await ingestGoogle(db, {
      lists: [{ url: urlB, name: 'B' }],
      fetcher: fetcherFromMap(map),
      perListDelayMs: 0,
    });

    expect(listPoisByCollection(db, 'A').length).toBe(aBefore);
  });

  it('safety: zero-place scrape does NOT delete existing POIs (failure mode protection)', async () => {
    const url = 'https://maps.app.goo.gl/zero-scrape';
    const map = new Map<string, FetchedList>();
    map.set(url, {
      url,
      finalUrl: url,
      pageTitle: 'Trip - Google Maps',
      rpcBodies: [rpcFixture('list-rpc.txt')],
    });

    await ingestGoogle(db, {
      lists: [{ url, name: 'Trip' }],
      fetcher: fetcherFromMap(map),
      perListDelayMs: 0,
    });
    expect(listPois(db)).toHaveLength(3);

    map.set(url, {
      url,
      finalUrl: url,
      pageTitle: 'Trip - Google Maps',
      rpcBodies: [rpcFixture('private-list-rpc.txt')],
    });
    const result = await ingestGoogle(db, {
      lists: [{ url, name: 'Trip' }],
      fetcher: fetcherFromMap(map),
      perListDelayMs: 0,
    });

    expect(result.removed).toBe(0);
    expect(result.enriched).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(listPois(db)).toHaveLength(3);
  });

  it('continues to subsequent lists when one fails', async () => {
    const goodUrl = 'https://maps.app.goo.gl/good';
    const badUrl = 'https://maps.app.goo.gl/bad';
    const map = new Map<string, FetchedList>();
    map.set(badUrl, {
      url: badUrl,
      finalUrl: badUrl,
      pageTitle: 'Bad - Google Maps',
      rpcBodies: [rpcFixture('private-list-rpc.txt')],
    });
    map.set(goodUrl, {
      url: goodUrl,
      finalUrl: goodUrl,
      pageTitle: 'Good - Google Maps',
      rpcBodies: [rpcFixture('list-rpc.txt')],
    });

    const result = await ingestGoogle(db, {
      lists: [{ url: badUrl }, { url: goodUrl }],
      fetcher: fetcherFromMap(map),
      perListDelayMs: 0,
    });

    expect(result.totalLists).toBe(2);
    expect(result.enriched).toBe(3);
    expect(result.failed).toHaveLength(1);
  });

  it('loadListsConfig parses a valid lists.json', async () => {
    const { loadListsConfig } = await import('../../src/ingest/google-list.ts');
    const cfg = loadListsConfig(join(FIXTURE_DIR, 'lists.sample.json'));
    expect(cfg.lists).toHaveLength(2);
    expect(cfg.lists[0]!.url).toMatch(/^https:\/\/maps\.app\.goo\.gl\//);
  });
});
