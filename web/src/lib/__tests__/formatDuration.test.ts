import { describe, expect, it } from 'vitest';
import { formatDuration } from '../formatDuration';

describe('formatDuration', () => {
  it('<60 min', () => {
    expect(formatDuration(38 * 60)).toBe('38 MIN');
  });
  it('60-119 min', () => {
    expect(formatDuration(72 * 60)).toBe('1 H 12 MIN');
  });
  it('>=120 min', () => {
    expect(formatDuration(134 * 60)).toBe('2 H 14 MIN');
  });
  it('exact hour', () => {
    expect(formatDuration(120 * 60)).toBe('2 H');
  });
  it('handles 0 seconds', () => {
    expect(formatDuration(0)).toBe('0 MIN');
  });
  it('handles negative as em-dash', () => {
    expect(formatDuration(-5)).toBe('—');
  });
});
