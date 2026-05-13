import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gpxExternalId, haversineMeters, parseGpx } from '../../src/ingest/gpx.ts';

const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'trails');

function load(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8');
}

describe('parseGpx', () => {
  it('parses a minimal 3-point GPX', () => {
    const r = parseGpx(load('simple.gpx'));
    expect(r.name).toBe('Simple test trail');
    expect(r.trailheadLat).toBeCloseTo(56.7867, 4);
    expect(r.trailheadLng).toBeCloseTo(-5.0035, 4);
    const geo = JSON.parse(r.geojson) as { type: string; coordinates: number[][] };
    expect(geo.type).toBe('LineString');
    expect(geo.coordinates).toHaveLength(3);
  });

  it('trailhead equals the first track point', () => {
    const r = parseGpx(load('simple.gpx'));
    expect(r.trailheadLat).toBe(56.7867);
    expect(r.trailheadLng).toBe(-5.0035);
  });

  it('lengthMeters matches expected haversine total within 1m', () => {
    const r = parseGpx(load('simple.gpx'));
    const expected =
      haversineMeters(56.7867, -5.0035, 56.79, -5.0) + haversineMeters(56.79, -5.0, 56.795, -4.995);
    expect(Math.abs(r.lengthMeters - expected)).toBeLessThan(1);
  });

  it('throws clear error on malformed XML', () => {
    expect(() => parseGpx('<gpx><trk><not-closed')).toThrow(/GPX XML parse error/);
  });

  it('handles multiple <trkseg> by concatenating points', () => {
    const r = parseGpx(load('multi-segment.gpx'));
    const geo = JSON.parse(r.geojson) as { coordinates: number[][] };
    expect(geo.coordinates).toHaveLength(4);
    expect(r.lengthMeters).toBeGreaterThan(0);
  });

  it('handles GPX without <ele> tags (elevation gain = 0)', () => {
    const r = parseGpx(load('no-elevation.gpx'));
    expect(r.elevationGainMeters).toBe(0);
    expect(r.lengthMeters).toBeGreaterThan(0);
  });
});

describe('gpxExternalId path normalisation', () => {
  it('POSIX-style paths resolve as POSIX', () => {
    const trailsDir = '/data/trails';
    const file = '/data/trails/scotland/loch-ness.gpx';
    expect(gpxExternalId(file, trailsDir)).toBe('scotland/loch-ness.gpx');
  });

  it('externalId never contains backslashes (cross-platform stability)', () => {
    const id = gpxExternalId('/data/trails/scotland/loch-ness.gpx', '/data/trails');
    expect(id).not.toContain('\\');
    expect(id).toBe('scotland/loch-ness.gpx');
  });
});
