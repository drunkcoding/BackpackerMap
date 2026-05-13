import { spawn } from 'node:child_process';

export interface AirbnbEnrichment {
  lat: number | null;
  lng: number | null;
  price_label: string | null;
  photo: string | null;
  name: string | null;
}

export interface EnrichOptions {
  scriptPath: string;
  pythonBin?: string;
  timeoutMs?: number;
  retries?: number;
  env?: NodeJS.ProcessEnv;
}

export class PyAirbnbError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number | null,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = 'PyAirbnbError';
  }
}

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

function runOnce(
  url: string,
  options: Required<Pick<EnrichOptions, 'scriptPath' | 'pythonBin' | 'timeoutMs'>> & {
    env?: NodeJS.ProcessEnv;
  },
): Promise<SpawnResult> {
  return new Promise((resolveResult) => {
    const child = spawn(options.pythonBin, [options.scriptPath, '--url', url], {
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

export async function enrichAirbnb(url: string, options: EnrichOptions): Promise<AirbnbEnrichment> {
  const pythonBin = options.pythonBin ?? (process.platform === 'win32' ? 'python' : 'python3');
  const timeoutMs = options.timeoutMs ?? 30_000;
  const retries = Math.max(0, options.retries ?? 1);
  const proxyUrl = process.env['HTTPS_PROXY'] ?? process.env['HTTP_PROXY'];
  const passthroughEnv: NodeJS.ProcessEnv = {};
  if (proxyUrl) {
    passthroughEnv['HTTPS_PROXY'] = proxyUrl;
    passthroughEnv['HTTP_PROXY'] = proxyUrl;
  }
  const mergedEnv = options.env || proxyUrl ? { ...passthroughEnv, ...options.env } : undefined;

  let lastErr: PyAirbnbError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await runOnce(url, {
      scriptPath: options.scriptPath,
      pythonBin,
      timeoutMs,
      ...(mergedEnv ? { env: mergedEnv } : {}),
    });
    if (result.timedOut) {
      lastErr = new PyAirbnbError(
        `pyairbnb timed out after ${timeoutMs}ms`,
        result.exitCode,
        result.stderr,
      );
      continue;
    }
    if (result.exitCode === 0) {
      try {
        return JSON.parse(result.stdout.trim()) as AirbnbEnrichment;
      } catch {
        lastErr = new PyAirbnbError(
          `pyairbnb returned non-JSON output: ${result.stdout.slice(0, 200)}`,
          result.exitCode,
          result.stderr,
        );
        continue;
      }
    }
    lastErr = new PyAirbnbError(
      `pyairbnb exited with code ${result.exitCode}`,
      result.exitCode,
      result.stderr,
    );
  }
  throw lastErr ?? new PyAirbnbError('pyairbnb failed (unknown reason)', null, '');
}
