import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, pruneSearchCache } from '../db/repo.ts';
import { createOrsClient } from '../routing/ors.ts';
import { createApp } from './app.ts';
import { createDispatcher, filterEnabledProviders } from '../search/dispatcher.ts';
import { PyairbnbProvider } from '../search/providers/pyairbnb.ts';
import { BookingDIYProvider } from '../search/providers/booking-diy.ts';
import { chromium } from 'playwright';
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

allProviders.push(
  new BookingDIYProvider({
    fetchHtml: async (url) => {
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          viewport: { width: 1440, height: 900 },
          locale: 'en-GB',
          timezoneId: 'Europe/London',
        });
        await applyStealth(context);
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
        return await page.content();
      } finally {
        await browser.close();
      }
    },
    perRequestDelayMs: 5_000,
    maxDetailFetches: 30,
  }),
);

const dispatcher = createDispatcher(filterEnabledProviders(allProviders, enabledProviders));

const cacheTtlMs = 10 * 60 * 1000;
pruneSearchCache(db, 60 * 60 * 1000);
setInterval(() => pruneSearchCache(db, 60 * 60 * 1000), 60 * 60 * 1000).unref();

const app = createApp({ db, ors, searchDispatcher: dispatcher, searchCacheTtlMs: cacheTtlMs });

app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
  console.log(`[server] search providers enabled: ${enabledProviders.join(', ')}`);
});
