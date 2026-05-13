import { describe, expect, it } from 'vitest';
import { extractAtlasLatLng } from '../../src/ingest/booking.ts';

describe('extractAtlasLatLng', () => {
  it('extracts lat,lng from a single data-atlas-latlng attribute', () => {
    const html = '<html><body><div data-atlas-latlng="55.93852,-3.191202"></div></body></html>';
    expect(extractAtlasLatLng(html)).toEqual({ lat: 55.93852, lng: -3.191202 });
  });

  it('returns the first when multiple identical-value attributes are present', () => {
    const html = `
      <div data-atlas-latlng="55.95,-3.19"></div>
      <div data-atlas-latlng="55.95,-3.19"></div>
      <div data-atlas-latlng="55.95,-3.19"></div>`;
    expect(extractAtlasLatLng(html)).toEqual({ lat: 55.95, lng: -3.19 });
  });

  it('returns null when the attribute is missing entirely', () => {
    expect(extractAtlasLatLng('<html><body></body></html>')).toBeNull();
  });

  it('returns null for malformed values', () => {
    expect(extractAtlasLatLng('<div data-atlas-latlng="not-a-coord"></div>')).toBeNull();
    expect(extractAtlasLatLng('<div data-atlas-latlng="55.95"></div>')).toBeNull();
    expect(extractAtlasLatLng('<div data-atlas-latlng="abc,def"></div>')).toBeNull();
  });

  it('rejects (0, 0) as a "no-coord" sentinel', () => {
    expect(extractAtlasLatLng('<div data-atlas-latlng="0,0"></div>')).toBeNull();
  });

  it('takes the first valid attribute even when later ones are malformed', () => {
    const html = `
      <div data-atlas-latlng="55.93,-3.19"></div>
      <div data-atlas-latlng="bad,coord"></div>`;
    expect(extractAtlasLatLng(html)).toEqual({ lat: 55.93, lng: -3.19 });
  });
});
