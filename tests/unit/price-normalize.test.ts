import { describe, expect, it } from 'vitest';
import { normalizePriceToTotal } from '../../src/search/price.ts';

describe('normalizePriceToTotal — airbnb', () => {
  it('multiplies per-night amount by nights when label has no "total" qualifier', () => {
    const out = normalizePriceToTotal(
      'airbnb',
      { priceLabel: '€88 / night', priceAmount: 88, currency: '€' },
      '2026-07-15',
      '2026-07-17',
    );
    expect(out.priceAmount).toBe(176);
    expect(out.priceLabel).toBe('€176 total');
    expect(out.currency).toBe('€');
  });

  it('keeps total intact when pyairbnb already supplied a "/ total" label', () => {
    const out = normalizePriceToTotal(
      'airbnb',
      { priceLabel: '€ 822.0 / total', priceAmount: 822, currency: '€ ' },
      '2026-07-15',
      '2026-07-17',
    );
    expect(out.priceAmount).toBe(822);
    expect(out.priceLabel).toBe('€ 822 total');
  });

  it('renders per-night label when no dates set (cannot compute total)', () => {
    const out = normalizePriceToTotal(
      'airbnb',
      { priceLabel: '$120 / night', priceAmount: 120, currency: '$' },
      null,
      null,
    );
    expect(out.priceAmount).toBe(120);
    expect(out.priceLabel).toBe('$120 / night');
  });

  it('passes through unchanged when priceAmount is null', () => {
    const out = normalizePriceToTotal(
      'airbnb',
      { priceLabel: null, priceAmount: null, currency: null },
      '2026-07-15',
      '2026-07-17',
    );
    expect(out).toEqual({ priceLabel: null, priceAmount: null, currency: null });
  });
});

describe('normalizePriceToTotal — booking', () => {
  it('parses "£76" as per-night and multiplies by nights for a 2-night stay', () => {
    const out = normalizePriceToTotal(
      'booking',
      { priceLabel: '£76', priceAmount: null, currency: null },
      '2026-07-15',
      '2026-07-17',
    );
    expect(out.priceAmount).toBe(152);
    expect(out.priceLabel).toBe('£152 total');
    expect(out.currency).toBe('£');
  });

  it('parses "€ 1,823" with comma thousands separator', () => {
    const out = normalizePriceToTotal(
      'booking',
      { priceLabel: '€ 1,823', priceAmount: null, currency: null },
      '2026-07-15',
      '2026-07-17',
    );
    expect(out.priceAmount).toBe(3646);
    expect(out.priceLabel).toBe('€3646 total');
  });

  it('renders per-night label when no dates set', () => {
    const out = normalizePriceToTotal(
      'booking',
      { priceLabel: '£87', priceAmount: null, currency: null },
      null,
      null,
    );
    expect(out.priceAmount).toBe(87);
    expect(out.priceLabel).toBe('£87 / night');
  });

  it('preserves null when label is unparseable', () => {
    const out = normalizePriceToTotal(
      'booking',
      { priceLabel: 'See on Booking', priceAmount: null, currency: null },
      '2026-07-15',
      '2026-07-17',
    );
    expect(out.priceLabel).toBe('See on Booking');
    expect(out.priceAmount).toBeNull();
  });

  it('uses pre-parsed priceAmount when label is null but amount is present', () => {
    const out = normalizePriceToTotal(
      'booking',
      { priceLabel: null, priceAmount: 100, currency: '£' },
      '2026-07-15',
      '2026-07-17',
    );
    expect(out.priceAmount).toBe(200);
    expect(out.priceLabel).toBe('£200 total');
  });
});

describe('normalizePriceToTotal — date edge cases', () => {
  it('treats checkout = checkin as no stay (no total computed)', () => {
    const out = normalizePriceToTotal(
      'airbnb',
      { priceLabel: '€100 / night', priceAmount: 100, currency: '€' },
      '2026-07-15',
      '2026-07-15',
    );
    expect(out.priceLabel).toBe('€100 / night');
  });

  it('treats inverted dates as no stay', () => {
    const out = normalizePriceToTotal(
      'booking',
      { priceLabel: '£80', priceAmount: null, currency: null },
      '2026-07-20',
      '2026-07-15',
    );
    expect(out.priceLabel).toBe('£80 / night');
  });

  it('handles a 7-night stay correctly', () => {
    const out = normalizePriceToTotal(
      'airbnb',
      { priceLabel: '€100 / night', priceAmount: 100, currency: '€' },
      '2026-07-15',
      '2026-07-22',
    );
    expect(out.priceAmount).toBe(700);
    expect(out.priceLabel).toBe('€700 total');
  });
});
