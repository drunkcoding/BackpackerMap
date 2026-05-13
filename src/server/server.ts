import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, pruneSearchCache } from '../db/repo.ts';
import { createOrsClient } from '../routing/ors.ts';
import { createApp } from './app.ts';
import { createDispatcher, filterEnabledProviders } from '../search/dispatcher.ts';
import { createPhotonClient } from './geocode/photon.ts';
import { createPolygonFetcher } from './geocode/polygon.ts';
import { PyairbnbProvider } from '../search/providers/pyairbnb.ts';
import { BookingDIYProvider } from '../search/providers/booking-diy.ts';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { applyStealth } from '../ingest/stealth.ts';
import type { ProviderName, SearchProvider } from '../search/types.ts';

const dbPath = resolve(process.cwd(), process.env['DB_PATH'] ?? './db/backpackermap.sqlite');
const port = Number(process.env['PORT'] ?? 3000);
const apiKey = process.env['ORS_API_KEY'] ?? '';
if (!apiKey) {
  console.warn('[server] ORS_API_KEY not set; /api/distance will fail until configured');
}

const db = openDb(dbPath);
const ors = createOrsClient({ apiKey });

const enabledProviders = (process.env['SEARCH_PROVIDERS'] ?? 'airbnb,booking')
  .split(',')
  .map((s) => s.trim())
  .filter((s): s is ProviderName => s === 'airbnb' || s === 'booking');

const allProviders: SearchProvider[] = [];

const here = fileURLToPath(new URL('.', import.meta.url));
const searchScript = resolve(here, '..', '..', 'scripts', 'pyairbnb_search.py');
const pythonBin = process.env['PYTHON_BIN'];
allProviders.push(
  new PyairbnbProvider({
    scriptPath: searchScript,
    ...(pythonBin ? { pythonBin } : {}),
  }),
);

let bookingBrowser: Browser | null = null;
let bookingContext: BrowserContext | null = null;

function isBrowserUsable(b: Browser | null): b is Browser {
  return b !== null && b.isConnected();
}

async function createBookingContext(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'en-GB',
    timezoneId: 'Europe/London',
  });
  ctx.once('close', () => {
    if (bookingContext === ctx) bookingContext = null;
  });
  await applyStealth(ctx);
  return ctx;
}

async function getBookingContext(): Promise<BrowserContext> {
  if (!isBrowserUsable(bookingBrowser)) {
    bookingContext = null;
    bookingBrowser = await chromium.launch({ headless: true });
    bookingBrowser.once('disconnected', () => {
      bookingBrowser = null;
      bookingContext = null;
    });
  }
  if (!bookingContext) {
    bookingContext = await createBookingContext(bookingBrowser);
  }
  return bookingContext;
}
async function closeBookingBrowser(): Promise<void> {
  try {
    await bookingContext?.close();
  } catch {}
  try {
    await bookingBrowser?.close();
  } catch {}
  bookingContext = null;
  bookingBrowser = null;
}
process.on('SIGINT', () => {
  void closeBookingBrowser().then(() => process.exit(0));
});
process.on('SIGTERM', () => {
  void closeBookingBrowser().then(() => process.exit(0));
});

async function bookingFetchOnce(url: string): Promise<string> {
  const context = await getBookingContext();
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(20_000);
  page.setDefaultTimeout(20_000);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
    return await page.content();
  } finally {
    await page.close().catch(() => {});
  }
}

function isContextClosedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /has been closed|Target page, context or browser/i.test(err.message);
}

allProviders.push(
  new BookingDIYProvider({
    fetchHtml: async (url) => {
      try {
        return await bookingFetchOnce(url);
      } catch (err) {
        if (!isContextClosedError(err)) throw err;
        bookingContext = null;
        return await bookingFetchOnce(url);
      }
    },
    perRequestDelayMs: 5_000,
    maxDetailFetches: 30,
    listMode: {
      concurrency: 3,
      maxDetailFetches: 8,
      perRequestDelayMs: 1500,
    },
  }),
);

const dispatcher = createDispatcher(filterEnabledProviders(allProviders, enabledProviders));

const cacheTtlMs = 10 * 60 * 1000;
pruneSearchCache(db, 60 * 60 * 1000);
setInterval(() => pruneSearchCache(db, 60 * 60 * 1000), 60 * 60 * 1000).unref();

const photon = createPhotonClient();
const polygon = createPolygonFetcher();
const app = createApp({
  db,
  ors,
  searchDispatcher: dispatcher,
  searchCacheTtlMs: cacheTtlMs,
  photon,
  polygon,
});

app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
  console.log(`[server] search providers enabled: ${enabledProviders.join(', ')}`);
});
