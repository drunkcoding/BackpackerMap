import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { enrichAirbnb, PyAirbnbError } from '../../src/lib/pyairbnb.ts';

const MOCK = join(process.cwd(), 'scripts', '__mock_pyairbnb.py');
const PYTHON_BIN =
  process.env['PYTHON_BIN'] ?? (process.platform === 'win32' ? 'python' : 'python3');

describe('enrichAirbnb (Python spawn wrapper)', () => {
  it('parses JSON output from the Python script', async () => {
    const result = await enrichAirbnb('https://www.airbnb.com/rooms/424242', {
      scriptPath: MOCK,
      pythonBin: PYTHON_BIN,
      timeoutMs: 5_000,
      retries: 0,
    });
    expect(result.lat).toBe(56.7867);
    expect(result.lng).toBe(-5.0035);
    expect(result.name).toBe('Mock cabin 424242');
  });

  it('throws PyAirbnbError on non-zero exit and includes stderr', async () => {
    await expect(
      enrichAirbnb('https://www.airbnb.com/rooms/1', {
        scriptPath: MOCK,
        pythonBin: PYTHON_BIN,
        timeoutMs: 5_000,
        retries: 0,
        env: { MOCK_PYAIRBNB_BEHAVIOUR: 'fail' },
      }),
    ).rejects.toThrowError(PyAirbnbError);
  });

  it('retries once on failure, then throws', async () => {
    const promise = enrichAirbnb('https://www.airbnb.com/rooms/1', {
      scriptPath: MOCK,
      pythonBin: PYTHON_BIN,
      timeoutMs: 5_000,
      retries: 1,
      env: { MOCK_PYAIRBNB_BEHAVIOUR: 'fail' },
    });
    await expect(promise).rejects.toMatchObject({
      name: 'PyAirbnbError',
      exitCode: 1,
    });
  });

  it('times out and throws if the script hangs', async () => {
    await expect(
      enrichAirbnb('https://www.airbnb.com/rooms/1', {
        scriptPath: MOCK,
        pythonBin: PYTHON_BIN,
        timeoutMs: 100,
        retries: 0,
        env: { MOCK_PYAIRBNB_BEHAVIOUR: 'sleep' },
      }),
    ).rejects.toThrowError(/timed out/);
  }, 10_000);
});
