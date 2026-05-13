import { readFileSync } from 'node:fs';
import { basename, relative } from 'node:path';
import { gpx as gpxToGeoJson } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';
import type { TrailInput } from '../db/repo.ts';

const EARTH_RADIUS_METERS = 6_371_008.8;

export function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const φ1 = toRad(aLat);
  const φ2 = toRad(bLat);
  const Δφ = toRad(bLat - aLat);
  const Δλ = toRad(bLng - aLng);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

export function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/');
}

export function gpxExternalId(absolutePath: string, trailsDir: string): string {
  const rel = relative(trailsDir, absolutePath);
  return toPosixPath(rel);
}

interface ParsedGpx {
  name: string;
  points: Array<{ lat: number; lng: number; ele: number | null }>;
}

function parseGpxXml(xml: string): ParsedGpx {
  const fatals: string[] = [];
  const parser = new DOMParser({
    onError: (level, msg) => {
      if (level === 'error' || level === 'fatalError') {
        fatals.push(String(msg));
      }
    },
  });

  let doc: ReturnType<typeof parser.parseFromString>;
  try {
    doc = parser.parseFromString(xml, 'text/xml');
  } catch (err) {
    throw new Error(
      `GPX XML parse error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (fatals.length > 0) {
    throw new Error(`GPX XML parse error: ${fatals.join('; ')}`);
  }

  const geo = gpxToGeoJson(doc as unknown as Parameters<typeof gpxToGeoJson>[0]);
  const features = geo.features ?? [];
  if (features.length === 0) {
    throw new Error('GPX contains no tracks or routes');
  }

  const first = features[0]!;
  const props = (first.properties as Record<string, unknown> | null) ?? {};
  const name =
    typeof props['name'] === 'string' && props['name'].trim().length > 0
      ? (props['name'] as string)
      : 'Untitled trail';

  const points: ParsedGpx['points'] = [];
  for (const f of features) {
    const geom = f.geometry;
    if (!geom) continue;
    const coordsLists: number[][][] =
      geom.type === 'LineString'
        ? [geom.coordinates as number[][]]
        : geom.type === 'MultiLineString'
        ? (geom.coordinates as number[][][])
        : [];
    for (const seg of coordsLists) {
      for (const c of seg) {
        const lng = c[0]!;
        const lat = c[1]!;
        const ele = c.length >= 3 && Number.isFinite(c[2]) ? (c[2] as number) : null;
        points.push({ lat, lng, ele });
      }
    }
  }

  if (points.length === 0) {
    throw new Error('GPX track has no points');
  }

  return { name, points };
}

export interface GpxParseResult {
  name: string;
  trailheadLat: number;
  trailheadLng: number;
  lengthMeters: number;
  elevationGainMeters: number;
  geojson: string;
}

export function parseGpx(xml: string): GpxParseResult {
  const { name, points } = parseGpxXml(xml);
  const head = points[0]!;

  let lengthMeters = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    lengthMeters += haversineMeters(a.lat, a.lng, b.lat, b.lng);
  }

  let elevationGainMeters = 0;
  let prevEle: number | null = null;
  for (const p of points) {
    if (p.ele !== null) {
      if (prevEle !== null) {
        const delta = p.ele - prevEle;
        if (delta > 0) elevationGainMeters += delta;
      }
      prevEle = p.ele;
    }
  }

  const geojson = JSON.stringify({
    type: 'LineString',
    coordinates: points.map((p) =>
      p.ele !== null ? [p.lng, p.lat, p.ele] : [p.lng, p.lat],
    ),
  });

  return {
    name,
    trailheadLat: head.lat,
    trailheadLng: head.lng,
    lengthMeters,
    elevationGainMeters,
    geojson,
  };
}

export function parseGpxFile(absolutePath: string, trailsDir: string, sourceId: number): TrailInput {
  const xml = readFileSync(absolutePath, 'utf8');
  const parsed = parseGpx(xml);
  const externalId = gpxExternalId(absolutePath, trailsDir);
  const fallbackName = basename(absolutePath, '.gpx');
  return {
    sourceId,
    externalId,
    name: parsed.name === 'Untitled trail' ? fallbackName : parsed.name,
    trailheadLat: parsed.trailheadLat,
    trailheadLng: parsed.trailheadLng,
    lengthMeters: parsed.lengthMeters,
    elevationGainMeters: parsed.elevationGainMeters,
    geojson: parsed.geojson,
    rawPath: absolutePath,
  };
}
