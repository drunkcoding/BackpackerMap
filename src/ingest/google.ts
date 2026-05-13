import { createHash } from 'node:crypto';
import type { PoiInput } from '../db/repo.ts';

export interface RawPlace {
  name: string;
  lat: number;
  lng: number;
  placeId: string | null;
  category: string | null;
  note: string | null;
  url: string | null;
  address: string | null;
  raw: unknown;
}

export interface ParsedList {
  collectionName: string | null;
  places: RawPlace[];
}

const PLACE_ID_RE = /^(?:ChIJ[0-9a-zA-Z_-]+|[0-9a-zA-Z_-]{27})$/;

function isCoord(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    isCoord(lat) &&
    isCoord(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function isPlausibleName(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const trimmed = s.trim();
  if (trimmed.length < 1 || trimmed.length > 200) return false;
  if (/^https?:/.test(trimmed)) return false;
  if (PLACE_ID_RE.test(trimmed)) return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return false;
  return true;
}

function stripJsonProlog(body: string): string {
  return body.replace(/^\)\]\}'\n?/, '');
}

export interface ParsePlacesOptions {
  maxPlaces?: number;
}

export function extractPlacesFromRpc(
  rpcBody: string,
  options: ParsePlacesOptions = {},
): RawPlace[] {
  return parseListResponse(rpcBody, options).places;
}

export function parseListResponse(
  body: string,
  options: ParsePlacesOptions = {},
): ParsedList {
  const max = options.maxPlaces ?? 500;
  const cleaned = stripJsonProlog(body);

  const structured = tryParseEntitylistShape(cleaned, max);
  if (structured && structured.places.length > 0) return structured;

  const fromRpcEnvelopes = tryParseBatchexecuteEnvelopes(cleaned, max);
  if (fromRpcEnvelopes.places.length > 0) return fromRpcEnvelopes;

  return tryParseAsRawJson(cleaned, max);
}

function tryParseEntitylistShape(body: string, max: number): ParsedList | null {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }

  if (!Array.isArray(data) || data.length === 0) return null;
  const root = data[0];
  if (!Array.isArray(root)) return null;

  const collectionName = typeof root[4] === 'string' ? root[4] : null;
  const placesNode = root[8];
  if (!Array.isArray(placesNode)) return null;

  const places: RawPlace[] = [];
  const seen = new Set<string>();
  for (const entry of placesNode) {
    if (places.length >= max) break;
    const p = parseEntitylistPlace(entry);
    if (!p) continue;
    const key = `${p.name}|${p.lat.toFixed(6)}|${p.lng.toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places.push(p);
  }

  if (places.length === 0) return null;
  return { collectionName, places };
}

function parseEntitylistPlace(entry: unknown): RawPlace | null {
  if (!Array.isArray(entry) || entry.length < 3) return null;
  const name = typeof entry[2] === 'string' ? entry[2] : null;
  if (!name || !isPlausibleName(name)) return null;

  const inner = entry[1];
  if (!Array.isArray(inner)) return null;

  const coordsHolder = inner[5];
  let lat: number | null = null;
  let lng: number | null = null;
  if (Array.isArray(coordsHolder) && coordsHolder.length >= 4) {
    if (isCoord(coordsHolder[2]) && isCoord(coordsHolder[3])) {
      lat = coordsHolder[2];
      lng = coordsHolder[3];
    }
  }
  if (lat === null || lng === null) {
    const found = findFirstLatLng(inner);
    if (found) {
      lat = found.lat;
      lng = found.lng;
    }
  }
  if (lat === null || lng === null || !isValidLatLng(lat, lng)) return null;

  const placeId = extractPlaceIdFromEntry(inner);
  const address = pickFirstStringMatching(inner, (s) => {
    const t = s.trim();
    return t.length >= 8 && t.length <= 300 && t.includes(',');
  });
  const note = entry.length > 3 && typeof entry[3] === 'string' && entry[3].trim().length > 0
    ? entry[3].trim()
    : null;

  return {
    name: name.trim(),
    lat,
    lng,
    placeId,
    category: null,
    note,
    url: null,
    address,
    raw: entry,
  };
}

function extractPlaceIdFromEntry(inner: unknown[]): string | null {
  const idPair = inner[6];
  if (Array.isArray(idPair) && idPair.length === 2) {
    if (typeof idPair[0] === 'string' && typeof idPair[1] === 'string') {
      return `${idPair[0]}_${idPair[1]}`;
    }
  }
  return null;
}

function pickFirstStringMatching(
  node: unknown,
  pred: (s: string) => boolean,
): string | null {
  if (typeof node === 'string' && pred(node)) return node;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = pickFirstStringMatching(child, pred);
      if (found !== null) return found;
    }
  }
  return null;
}

function findFirstLatLng(node: unknown): { lat: number; lng: number } | null {
  if (Array.isArray(node)) {
    if (node.length === 2 && isCoord(node[0]) && isCoord(node[1]) && isValidLatLng(node[0], node[1])) {
      return { lat: node[0], lng: node[1] };
    }
    if (node.length >= 4 && isCoord(node[2]) && isCoord(node[3]) && isValidLatLng(node[2], node[3])) {
      return { lat: node[2], lng: node[3] };
    }
    for (const child of node) {
      const found = findFirstLatLng(child);
      if (found) return found;
    }
  }
  return null;
}

function tryParseBatchexecuteEnvelopes(body: string, max: number): ParsedList {
  const places: RawPlace[] = [];
  const seen = new Set<string>();
  const wrbRe = /"wrb\.fr"/g;
  for (;;) {
    const match = wrbRe.exec(body);
    if (match === null) break;
    const stringStart = body.indexOf('"[', match.index);
    if (stringStart === -1) continue;
    const inner = readStringLiteralAt(body, stringStart);
    if (inner === null) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(inner);
    } catch {
      continue;
    }
    walkHeuristic(parsed, places, seen, max);
    if (places.length >= max) break;
  }
  return { collectionName: null, places };
}

function tryParseAsRawJson(body: string, max: number): ParsedList {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { collectionName: null, places: [] };
  }
  const places: RawPlace[] = [];
  const seen = new Set<string>();
  walkHeuristic(parsed, places, seen, max);
  return { collectionName: null, places };
}

function readStringLiteralAt(s: string, at: number): string | null {
  if (s[at] !== '"') return null;
  let i = at + 1;
  const out: string[] = [];
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      const next = s[i + 1];
      if (next === 'n') out.push('\n');
      else if (next === 't') out.push('\t');
      else if (next === 'r') out.push('\r');
      else if (next === '"') out.push('"');
      else if (next === '\\') out.push('\\');
      else if (next === '/') out.push('/');
      else if (next === 'u') {
        const hex = s.slice(i + 2, i + 6);
        out.push(String.fromCharCode(parseInt(hex, 16)));
        i += 6;
        continue;
      } else out.push(next ?? '');
      i += 2;
    } else if (c === '"') {
      return out.join('');
    } else {
      out.push(c ?? '');
      i++;
    }
  }
  return null;
}

function isPlaceArrayHeuristic(node: unknown): node is unknown[] {
  if (!Array.isArray(node)) return false;
  const first = node[0];
  if (!isPlausibleName(first)) return false;
  for (const child of node) {
    if (Array.isArray(child) && child.length >= 2) {
      if (isCoord(child[0]) && isCoord(child[1]) && isValidLatLng(child[0], child[1])) {
        return true;
      }
    }
  }
  return false;
}

function walkHeuristic(
  node: unknown,
  out: RawPlace[],
  seen: Set<string>,
  max: number,
): void {
  if (out.length >= max) return;
  if (!Array.isArray(node)) return;

  if (isPlaceArrayHeuristic(node)) {
    const name = (node[0] as string).trim();
    const coords = findFirstLatLng(node);
    if (!coords) return;
    const key = `${name}|${coords.lat.toFixed(6)}|${coords.lng.toFixed(6)}`;
    if (!seen.has(key)) {
      seen.add(key);
      const address = pickFirstStringMatching(node, (s) => {
        const t = s.trim();
        return t.length >= 8 && t.length <= 300 && t.includes(',') && /[a-zA-Z]/.test(t);
      });
      out.push({
        name,
        lat: coords.lat,
        lng: coords.lng,
        placeId: findPlaceIdHeuristic(node),
        category: null,
        note: findNoteWithinPlace(node, name, address),
        url: pickFirstStringMatching(node, (s) =>
          /^https?:\/\/(www\.)?(google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)/.test(s),
        ),
        address,
        raw: node,
      });
    }
    return;
  }

  for (const child of node) {
    walkHeuristic(child, out, seen, max);
    if (out.length >= max) return;
  }
}

function findPlaceIdHeuristic(node: unknown): string | null {
  if (typeof node === 'string' && PLACE_ID_RE.test(node)) return node;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findPlaceIdHeuristic(child);
      if (found) return found;
    }
  }
  return null;
}

function findNoteWithinPlace(
  placeNode: unknown[],
  name: string,
  address: string | null,
): string | null {
  for (let i = 1; i < placeNode.length; i++) {
    const v = placeNode[i];
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (t.length < 1 || t.length > 500) continue;
    if (t === name || t === address) continue;
    if (/^https?:/.test(t)) continue;
    if (PLACE_ID_RE.test(t)) continue;
    if (t.includes(',') && /\d/.test(t)) continue;
    if (KNOWN_CATEGORIES.has(t)) continue;
    return t;
  }
  return null;
}

const KNOWN_CATEGORIES = new Set([
  'Restaurant', 'Cafe', 'Café', 'Bar', 'Pub', 'Hotel', 'Lodge',
  'Tourist attraction', 'Park', 'Lake', 'Mountain', 'Viewpoint',
  'Museum', 'Gallery', 'Store', 'Shop', 'Supermarket', 'Bakery',
  'Bus stop', 'Train station', 'Parking', 'Gas station',
]);

export function rawPlaceToPoiInput(
  raw: RawPlace,
  sourceId: number,
  collection: string,
): PoiInput {
  const externalId =
    raw.placeId ??
    createHash('sha256')
      .update(
        `${raw.name}|${raw.lat.toFixed(6)}|${raw.lng.toFixed(6)}|${collection}`,
      )
      .digest('hex')
      .slice(0, 32);

  return {
    sourceId,
    collection,
    externalId,
    name: raw.name,
    lat: raw.lat,
    lng: raw.lng,
    category: raw.category,
    note: raw.note,
    url: raw.url,
    address: raw.address,
    raw: JSON.stringify(raw.raw),
  };
}
