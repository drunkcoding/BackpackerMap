import { readFileSync } from 'node:fs';
import type { Browser, BrowserContext, Page, Response as PlaywrightResponse } from 'playwright';
import { chromium } from 'playwright';
import type { Database } from 'better-sqlite3';
import { getOrCreateSource, replaceCollectionPois } from '../db/repo.ts';
import { applyStealth } from './stealth.ts';
import { parseListResponse, rawPlaceToPoiInput, type RawPlace } from './google.ts';

export interface GoogleListConfig {
  url: string;
  name?: string;
}

export interface GoogleListsFile {
  lists: GoogleListConfig[];
}

export function loadListsConfig(path: string): GoogleListsFile {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('lists config must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  const lists = obj['lists'];
  if (!Array.isArray(lists)) {
    throw new Error('lists config must have a "lists" array');
  }
  const out: GoogleListConfig[] = [];
  for (const item of lists) {
    if (typeof item !== 'object' || item === null) {
      throw new Error('each list entry must be an object');
    }
    const entry = item as Record<string, unknown>;
    if (typeof entry['url'] !== 'string') {
      throw new Error('each list entry must have a "url" string');
    }
    const cfg: GoogleListConfig = { url: entry['url'] };
    if (typeof entry['name'] === 'string') cfg.name = entry['name'];
    out.push(cfg);
  }
  return { lists: out };
}

export interface FetchedList {
  url: string;
  rpcBodies: string[];
  pageTitle: string | null;
  finalUrl: string;
}

export type ListFetcher = (url: string) => Promise<FetchedList>;

export interface IngestGoogleOptions {
  listsPath?: string;
  lists?: GoogleListConfig[];
  perListDelayMs?: number;
  headless?: boolean;
  fetcher?: ListFetcher;
  proxy?: { server: string; username?: string; password?: string };
  stealth?: boolean;
  scrollPasses?: number;
  maxPlacesPerList?: number;
}

export interface IngestGoogleResult {
  totalLists: number;
  totalPlaces: number;
  enriched: number;
  removed: number;
  failed: Array<{ url: string; message: string }>;
}

function resolveProxy(opts: IngestGoogleOptions['proxy']): IngestGoogleOptions['proxy'] | undefined {
  if (opts) return opts;
  const url = process.env['HTTPS_PROXY'] ?? process.env['HTTP_PROXY'];
  if (!url) return undefined;
  return { server: url };
}

function deriveCollectionName(cfg: GoogleListConfig, fetched: FetchedList): string {
  if (cfg.name && cfg.name.trim().length > 0) return cfg.name.trim();
  if (fetched.pageTitle && fetched.pageTitle.trim().length > 0) {
    return fetched.pageTitle
      .replace(/\s*[-–|]\s*Google Maps$/i, '')
      .trim();
  }
  try {
    const u = new URL(fetched.finalUrl);
    const slug = u.pathname.split('/').filter(Boolean).pop();
    if (slug) return slug;
  } catch {
    void 0;
  }
  return cfg.url;
}

export async function ingestGoogle(
  db: Database,
  options: IngestGoogleOptions = {},
): Promise<IngestGoogleResult> {
  const lists = options.lists ?? (options.listsPath ? loadListsConfig(options.listsPath).lists : []);
  if (lists.length === 0) {
    return { totalLists: 0, totalPlaces: 0, enriched: 0, removed: 0, failed: [] };
  }

  const perListDelayMs = options.perListDelayMs ?? 3_000;
  const maxPlacesPerList = options.maxPlacesPerList ?? 500;

  if (options.fetcher) {
    return ingestWithFetcher(db, options.fetcher, lists, 0, maxPlacesPerList);
  }

  const proxy = resolveProxy(options.proxy);
  const browser: Browser = await chromium.launch({
    headless: options.headless ?? true,
    ...(proxy ? { proxy } : {}),
  });
  try {
    const context: BrowserContext = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 900 },
      locale: 'en-GB',
      timezoneId: 'Europe/London',
    });
    if (options.stealth !== false) {
      await applyStealth(context);
    }
    await context.addCookies([
      {
        name: 'CONSENT',
        value: 'YES+cb.20210720-07-p0.en+FX+410',
        domain: '.google.com',
        path: '/',
        expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
        httpOnly: false,
        secure: true,
        sameSite: 'Lax',
      },
      {
        name: 'SOCS',
        value: 'CAESHAgBEhJnd3NfMjAyNDAxMjQtMF9SQzIaAmVuIAEaBgiAhrSiBg',
        domain: '.google.com',
        path: '/',
        expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
        httpOnly: false,
        secure: true,
        sameSite: 'Lax',
      },
    ]);
    const page: Page = await context.newPage();
    const scrollPasses = options.scrollPasses ?? 6;

    const fetcher: ListFetcher = (url) => fetchListViaPage(page, url, scrollPasses);
    return await ingestWithFetcher(db, fetcher, lists, perListDelayMs, maxPlacesPerList);
  } finally {
    await browser.close();
  }
}

async function fetchListViaPage(
  page: Page,
  url: string,
  scrollPasses: number,
): Promise<FetchedList> {
  const rpcBodies: string[] = [];
  const onResponse = async (response: PlaywrightResponse): Promise<void> => {
    const reqUrl = response.url();
    const isEntityList = reqUrl.includes('/maps/preview/entitylist/getlist');
    const isBatchExecute = reqUrl.includes('/batchexecute');
    if (!isEntityList && !isBatchExecute) return;
    try {
      const text = await response.text();
      if (isEntityList || text.includes('wrb.fr')) rpcBodies.push(text);
    } catch {
      void 0;
    }
  };
  page.on('response', onResponse);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    const scrollScript = `
      (function() {
        var d = (typeof document !== 'undefined') ? document : null;
        if (!d) return;
        var panel = d.querySelector('[role="feed"]')
          || d.querySelector('[role="main"]')
          || d.scrollingElement;
        if (panel && typeof panel.scrollBy === 'function') {
          var h = (panel.clientHeight || 800);
          panel.scrollBy({ top: h, behavior: 'instant' });
        }
      })();
    `;
    for (let i = 0; i < scrollPasses; i++) {
      const before = rpcBodies.length;
      await page.evaluate(scrollScript);
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(500);
      if (rpcBodies.length === before && i >= 1) break;
    }
  } finally {
    page.off('response', onResponse);
  }

  const pageTitle = await page.title().catch(() => null);
  const finalUrl = page.url();
  return { url, rpcBodies, pageTitle, finalUrl };
}

async function ingestWithFetcher(
  db: Database,
  fetcher: ListFetcher,
  lists: GoogleListConfig[],
  perListDelayMs: number,
  maxPlacesPerList: number,
): Promise<IngestGoogleResult> {
  const sourceId = getOrCreateSource(db, 'google_maps');
  const failed: IngestGoogleResult['failed'] = [];
  let totalPlaces = 0;
  let enriched = 0;
  let removed = 0;

  for (let i = 0; i < lists.length; i++) {
    const cfg = lists[i]!;
    try {
      const fetched = await fetcher(cfg.url);

      if (/sign[\s-]?in|log[\s-]?in/i.test(fetched.pageTitle ?? '')) {
        failed.push({
          url: cfg.url,
          message: 'private list — sign-in required, not supported in MVP',
        });
        continue;
      }

      const places: RawPlace[] = [];
      const seenKeys = new Set<string>();
      let parsedCollectionName: string | null = null;

      for (const body of fetched.rpcBodies) {
        const parsed = parseListResponse(body, { maxPlaces: maxPlacesPerList });
        if (parsed.collectionName && !parsedCollectionName) {
          parsedCollectionName = parsed.collectionName;
        }
        for (const p of parsed.places) {
          const key = `${p.name}|${p.lat.toFixed(6)}|${p.lng.toFixed(6)}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          places.push(p);
          if (places.length >= maxPlacesPerList) break;
        }
        if (places.length >= maxPlacesPerList) break;
      }

      const fetchedWithName: FetchedList = parsedCollectionName
        ? { ...fetched, pageTitle: parsedCollectionName }
        : fetched;
      const collection = deriveCollectionName(cfg, fetchedWithName);

      if (places.length === 0) {
        failed.push({
          url: cfg.url,
          message: 'no places parsed — selector may be stale or list may be private',
        });
        continue;
      }

      const inputs = places.map((p) => rawPlaceToPoiInput(p, sourceId, collection));
      const result = replaceCollectionPois(db, sourceId, collection, inputs);
      totalPlaces += result.total;
      enriched += result.inserted + result.updated;
      removed += result.removed;
    } catch (err) {
      failed.push({
        url: cfg.url,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    if (perListDelayMs > 0 && i < lists.length - 1) {
      await new Promise((r) => setTimeout(r, perListDelayMs));
    }
  }

  return { totalLists: lists.length, totalPlaces, enriched, removed, failed };
}
