import { describe, expect, it } from 'vitest';
import { divIconFor } from '../MapView';
import { candidateDivIcon } from '../CandidateLayer';

function htmlOf(icon: unknown): string {
  const opts = (icon as { options: { html?: string } }).options;
  return opts.html ?? '';
}

function sizeOf(icon: unknown): number[] {
  return (icon as { options: { iconSize: number[] } }).options.iconSize;
}

describe('divIconFor (saved property markers)', () => {
  it('includes provider-specific class and the SVG icon', () => {
    const html = htmlOf(divIconFor('airbnb', false, null));
    expect(html).toContain('bpm-marker--airbnb');
    expect(html).toContain('<svg');
  });

  it('includes Booking class for booking provider', () => {
    const html = htmlOf(divIconFor('booking', false, null));
    expect(html).toContain('bpm-marker--booking');
  });

  it('omits price pill when priceLabel is null', () => {
    const html = htmlOf(divIconFor('airbnb', false, null));
    expect(html).not.toContain('bpm-marker__price');
  });

  it('renders price pill with the label text', () => {
    const html = htmlOf(divIconFor('airbnb', false, '£140'));
    expect(html).toContain('bpm-marker__price');
    expect(html).toContain('£140');
  });

  it('adds selected class when selected', () => {
    const html = htmlOf(divIconFor('airbnb', true, null));
    expect(html).toContain('bpm-marker--selected');
  });

  it('escapes HTML in priceLabel (XSS guard)', () => {
    const html = htmlOf(divIconFor('airbnb', false, '<script>alert(1)</script>'));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('iconSize widens when price label is present', () => {
    const noPriceSize = sizeOf(divIconFor('airbnb', false, null));
    const withPriceSize = sizeOf(divIconFor('airbnb', false, '£100'));
    expect(withPriceSize[0]).toBeGreaterThan(noPriceSize[0]!);
  });
});

describe('candidateDivIcon (Discover candidate markers)', () => {
  it('includes candidate class for muted styling', () => {
    const html = htmlOf(candidateDivIcon('airbnb', null));
    expect(html).toContain('bpm-marker--candidate');
  });

  it('renders price pill when priceLabel is provided', () => {
    const html = htmlOf(candidateDivIcon('booking', '€85'));
    expect(html).toContain('bpm-marker__price');
    expect(html).toContain('€85');
  });

  it('escapes HTML in priceLabel', () => {
    const html = htmlOf(candidateDivIcon('booking', '"><img onerror=alert(1)>'));
    expect(html).not.toContain('"><img onerror=alert(1)>');
    expect(html).toContain('&quot;');
    expect(html).toContain('&lt;img');
  });
});
