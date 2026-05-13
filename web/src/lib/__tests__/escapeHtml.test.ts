import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../escapeHtml';

describe('escapeHtml', () => {
  it('escapes < and >', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes & before everything else (no double escape)', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('escapes quotes', () => {
    expect(escapeHtml('"hi"')).toBe('&quot;hi&quot;');
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('passes through safe price-label content', () => {
    expect(escapeHtml('£140')).toBe('£140');
    expect(escapeHtml('$120/night')).toBe('$120/night');
    expect(escapeHtml('€85')).toBe('€85');
  });

  it('handles full XSS payload', () => {
    const out = escapeHtml('<img src=x onerror="alert(1)">');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).toContain('&lt;img');
  });
});
