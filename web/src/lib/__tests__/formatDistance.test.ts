import { describe, expect, it } from 'vitest';
import { formatDistance } from '../formatDistance';

describe('formatDistance', () => {
  it('renders <1km in metres', () => {
    expect(formatDistance(850)).toBe('850 M');
  });
  it('renders <100km without decimal, with KM suffix', () => {
    expect(formatDistance(42_000)).toBe('42 KM');
  });
  it('renders >=100km with thousands separator', () => {
    expect(formatDistance(1_420_000)).toBe('1,420 KM');
  });
  it('handles 0 metres', () => {
    expect(formatDistance(0)).toBe('0 M');
  });
  it('handles negative input as em-dash', () => {
    expect(formatDistance(-1)).toBe('—');
  });
});
