import { describe, expect, it, vi } from 'vitest';
import { applyStealth } from '../../src/ingest/stealth.ts';

describe('applyStealth', () => {
  it('registers an init script on the context', async () => {
    const ctx = { addInitScript: vi.fn(async () => undefined) };
    await applyStealth(ctx as never);
    expect(ctx.addInitScript).toHaveBeenCalledTimes(1);
    const script = (ctx.addInitScript.mock.calls as unknown as Array<[string]>)[0]![0];
    expect(script).toContain('navigator');
    expect(script).toContain('webdriver');
    expect(script).toContain('WebGLRenderingContext');
    expect(script).toContain('plugins');
    expect(script).toContain('languages');
  });
});
