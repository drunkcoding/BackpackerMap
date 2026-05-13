import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractPlacesFromRpc,
  parseListResponse,
  rawPlaceToPoiInput,
} from '../../src/ingest/google.ts';

const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'google');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8');
}

describe('extractPlacesFromRpc', () => {
  it('extracts all 3 places from the sample RPC payload', () => {
    const body = loadFixture('list-rpc.txt');
    const places = extractPlacesFromRpc(body);
    expect(places).toHaveLength(3);

    const names = places.map((p) => p.name).sort();
    expect(names).toEqual([
      'Falls of Falloch viewpoint',
      'Loch Lomond Shore',
      'The Drovers Inn',
    ]);
  });

  it('extracts lat/lng correctly', () => {
    const places = extractPlacesFromRpc(loadFixture('list-rpc.txt'));
    const drovers = places.find((p) => p.name === 'The Drovers Inn');
    expect(drovers).toBeDefined();
    expect(drovers!.lat).toBeCloseTo(56.2710, 4);
    expect(drovers!.lng).toBeCloseTo(-4.7150, 4);
  });

  it('extracts place_id when present', () => {
    const places = extractPlacesFromRpc(loadFixture('list-rpc.txt'));
    const drovers = places.find((p) => p.name === 'The Drovers Inn');
    expect(drovers!.placeId).toBe('ChIJ_aaaaaaaaaaaaaaaaaaaaaa1');

    const loch = places.find((p) => p.name === 'Loch Lomond Shore');
    expect(loch!.placeId).toBeNull();
  });

  it('extracts address when present', () => {
    const places = extractPlacesFromRpc(loadFixture('list-rpc.txt'));
    const drovers = places.find((p) => p.name === 'The Drovers Inn');
    expect(drovers!.address).toMatch(/Inverarnan/);
  });

  it('extracts user note when present', () => {
    const places = extractPlacesFromRpc(loadFixture('list-rpc.txt'));
    const drovers = places.find((p) => p.name === 'The Drovers Inn');
    expect(drovers!.note).toBe('great rest stop');

    const falls = places.find((p) => p.name === 'Falls of Falloch viewpoint');
    expect(falls!.note).toBeNull();
  });

  it('extracts Google Maps URL when present', () => {
    const places = extractPlacesFromRpc(loadFixture('list-rpc.txt'));
    const falls = places.find((p) => p.name === 'Falls of Falloch viewpoint');
    expect(falls!.url).toContain('maps.app.goo.gl');
  });

  it('returns empty array on private-list payload (no places)', () => {
    const body = loadFixture('private-list-rpc.txt');
    const places = extractPlacesFromRpc(body);
    expect(places).toEqual([]);
  });

  it('is deterministic: parsing the same input twice yields identical records', () => {
    const body = loadFixture('list-rpc.txt');
    const a = extractPlacesFromRpc(body);
    const b = extractPlacesFromRpc(body);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('respects maxPlaces cap', () => {
    const body = loadFixture('list-rpc.txt');
    const places = extractPlacesFromRpc(body, { maxPlaces: 2 });
    expect(places).toHaveLength(2);
  });

  it('rejects invalid lat/lng (0,0 and out-of-range)', () => {
    const fakeRpc =
      ")]}\'\n" +
      JSON.stringify([
        [
          'wrb.fr',
          'x',
          JSON.stringify([
            null,
            null,
            [
              [null, null, ['Null Island', null, [0, 0], 'ChIJ_xxxxxxxxxxxxxxxxxxxxxx1', null, 'nowhere', null]],
              [null, null, ['Out of range', null, [200, 300], 'ChIJ_xxxxxxxxxxxxxxxxxxxxxx2', null, 'invalid', null]],
              [null, null, ['Valid place', null, [51.5, -0.1], 'ChIJ_xxxxxxxxxxxxxxxxxxxxxx3', null, 'London', null]],
            ],
          ]),
        ],
      ]);
    const places = extractPlacesFromRpc(fakeRpc);
    expect(places).toHaveLength(1);
    expect(places[0]!.name).toBe('Valid place');
  });
});

describe('parseListResponse (entitylist/getlist real shape)', () => {
  it('extracts 8 places and collection name from sanitized real Google Maps response', () => {
    const body = loadFixture('entitylist-real.txt');
    const result = parseListResponse(body);
    expect(result.collectionName).toBe('Dolomites');
    expect(result.places).toHaveLength(8);

    const names = result.places.map((p) => p.name).sort();
    expect(names).toEqual([
      'Cinque Torri',
      "Saeed's water fountain",
      'Karersee',
      'Langkofel',
      'Lagazuoi',
      'Tre Cime di Lavaredo',
      'Seceda',
      'Furchetta',
    ].sort());
  });

  it('extracts valid Dolomites coordinates', () => {
    const result = parseListResponse(loadFixture('entitylist-real.txt'));
    for (const p of result.places) {
      expect(p.lat).toBeGreaterThan(46);
      expect(p.lat).toBeLessThan(47);
      expect(p.lng).toBeGreaterThan(11);
      expect(p.lng).toBeLessThan(13);
    }
  });

  it('uses the numeric Google place ID pair as external_id', () => {
    const result = parseListResponse(loadFixture('entitylist-real.txt'));
    const cinque = result.places.find((p) => p.name === 'Cinque Torri');
    expect(cinque!.placeId).toBe('5149927529933133803_-3147860471384431399');
  });
});

describe('rawPlaceToPoiInput', () => {
  it('uses place_id as external_id when present', () => {
    const places = extractPlacesFromRpc(loadFixture('list-rpc.txt'));
    const drovers = places.find((p) => p.name === 'The Drovers Inn')!;
    const input = rawPlaceToPoiInput(drovers, 42, 'Scotland Trip 2026');
    expect(input.externalId).toBe('ChIJ_aaaaaaaaaaaaaaaaaaaaaa1');
    expect(input.sourceId).toBe(42);
    expect(input.collection).toBe('Scotland Trip 2026');
  });

  it('falls back to sha256 hash when no place_id', () => {
    const places = extractPlacesFromRpc(loadFixture('list-rpc.txt'));
    const loch = places.find((p) => p.name === 'Loch Lomond Shore')!;
    const input = rawPlaceToPoiInput(loch, 1, 'Scotland Trip 2026');
    expect(input.externalId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('hash external_id is deterministic across invocations', () => {
    const places = extractPlacesFromRpc(loadFixture('list-rpc.txt'));
    const loch = places.find((p) => p.name === 'Loch Lomond Shore')!;
    const a = rawPlaceToPoiInput(loch, 1, 'X');
    const b = rawPlaceToPoiInput(loch, 1, 'X');
    expect(a.externalId).toBe(b.externalId);
  });

  it('hash external_id changes when collection changes', () => {
    const places = extractPlacesFromRpc(loadFixture('list-rpc.txt'));
    const loch = places.find((p) => p.name === 'Loch Lomond Shore')!;
    const a = rawPlaceToPoiInput(loch, 1, 'A');
    const b = rawPlaceToPoiInput(loch, 1, 'B');
    expect(a.externalId).not.toBe(b.externalId);
  });

  it('preserves note and address fields', () => {
    const places = extractPlacesFromRpc(loadFixture('list-rpc.txt'));
    const drovers = places.find((p) => p.name === 'The Drovers Inn')!;
    const input = rawPlaceToPoiInput(drovers, 1, 'X');
    expect(input.note).toBe('great rest stop');
    expect(input.address).toMatch(/Inverarnan/);
  });
});
