import { spawn } from 'node:child_process';
import {
  ProviderError,
  type ProviderResult,
  type SearchProvider,
  type SearchQuery,
} from '../types.ts';
import { buildAirbnbSearchUrl } from './airbnb-url.ts';

export interface PyairbnbProviderOptions {
  scriptPath: string;
  pythonBin?: string;
  timeoutMs?: number;
  retries?: number;
  env?: NodeJS.ProcessEnv;
}

interface RawSearchItem {
  provider: 'airbnb';
  external_id: string;
  name: string;
  url: string;
  lat: number;
  lng: number;
  price_label: string | null;
  price_amount: number | null;
  currency: string | null;
  photo_url: string | null;
  rating: number | null;
  review_count: number | null;
  raw?: unknown;
}

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

function runOnce(
  args: string[],
  options: { pythonBin: string; scriptPath: string; timeoutMs: number; env?: NodeJS.ProcessEnv },
): Promise<SpawnResult> {
  return new Promise((resolveResult) => {
    const child = spawn(options.pythonBin, [options.scriptPath, ...args], {
      env: { ...process.env, ...options.env },
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveResult({ stdout, stderr, exitCode: code, timedOut });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      stderr += `\n${err.message}`;
      resolveResult({ stdout, stderr, exitCode: null, timedOut });
    });
  });
}

export class PyairbnbProvider implements SearchProvider {
  readonly name = 'pyairbnb';
  readonly provider = 'airbnb' as const;

  constructor(private readonly options: PyairbnbProviderOptions) {}

  async search(query: SearchQuery): Promise<ProviderResult[]> {
    const bbox = query.bbox;
    if (bbox.north === bbox.south && bbox.east === bbox.west) {
      return [];
    }

    const url = buildAirbnbSearchUrl(query);
    const pythonBin =
      this.options.pythonBin ?? (process.platform === 'win32' ? 'python' : 'python3');
    const timeoutMs = this.options.timeoutMs ?? 60_000;
    const retries = Math.max(0, this.options.retries ?? 1);

    const proxyUrl = process.env['HTTPS_PROXY'] ?? process.env['HTTP_PROXY'];
    const passthroughEnv: NodeJS.ProcessEnv = {};
    if (proxyUrl) {
      passthroughEnv['HTTPS_PROXY'] = proxyUrl;
      passthroughEnv['HTTP_PROXY'] = proxyUrl;
    }
    const mergedEnv =
      this.options.env || proxyUrl ? { ...passthroughEnv, ...this.options.env } : undefined;

    let lastErr: ProviderError | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const result = await runOnce(
        [
          '--url',
          url,
          '--currency',
          query.currency,
          '--language',
          'en',
          '--max-results',
          String(query.maxResults),
        ],
        {
          pythonBin,
          scriptPath: this.options.scriptPath,
          timeoutMs,
          ...(mergedEnv ? { env: mergedEnv } : {}),
        },
      );

      if (result.timedOut) {
        lastErr = new ProviderError(
          `pyairbnb search timed out after ${timeoutMs}ms`,
          this.name,
          result.stderr,
        );
        continue;
      }
      if (result.exitCode === 0) {
        try {
          const items = JSON.parse(result.stdout.trim()) as RawSearchItem[];
          return items.map(toProviderResult).filter((r) => r.externalId !== '');
        } catch (err) {
          lastErr = new ProviderError(
            `pyairbnb returned non-JSON output: ${result.stdout.slice(0, 200)}`,
            this.name,
            err,
          );
          continue;
        }
      }
      lastErr = new ProviderError(
        `pyairbnb exited with code ${result.exitCode}: ${result.stderr.slice(0, 200)}`,
        this.name,
        result.stderr,
      );
    }
    throw lastErr ?? new ProviderError('pyairbnb failed (unknown reason)', this.name);
  }
}

function toProviderResult(item: RawSearchItem): ProviderResult {
  return {
    provider: 'airbnb',
    externalId: item.external_id,
    name: item.name,
    url: item.url,
    lat: item.lat,
    lng: item.lng,
    priceLabel: item.price_label,
    priceAmount: item.price_amount,
    currency: item.currency,
    photoUrl: item.photo_url,
    rating: item.rating,
    reviewCount: item.review_count,
    rawJson: JSON.stringify(item.raw ?? item),
  };
}
