import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const place1 = [
  null,
  null,
  [
    'The Drovers Inn',
    null,
    [56.271, -4.715],
    'ChIJ_aaaaaaaaaaaaaaaaaaaaaa1',
    null,
    'Inverarnan, Crianlarich G83 7DX, UK',
    'great rest stop',
    null,
    'Restaurant',
    'https://www.google.com/maps/place/The+Drovers+Inn',
  ],
];

const place2 = [
  null,
  null,
  [
    'Falls of Falloch viewpoint',
    null,
    [56.345, -4.705],
    'ChIJ_bbbbbbbbbbbbbbbbbbbbbb2',
    null,
    'A82, Crianlarich FK20 8QS, UK',
    null,
    null,
    'Tourist attraction',
    'https://maps.app.goo.gl/exampleFalls',
  ],
];

const place3 = [
  null,
  null,
  [
    'Loch Lomond Shore',
    null,
    [56.109, -4.632],
    null,
    null,
    'Balmaha, Glasgow G63, UK',
    'parking + start of West Highland Way',
    null,
    'Lake',
    null,
  ],
];

const listPayload = [['Scotland Trip 2026'], null, [place1, place2, place3]];

const innerJsonString = JSON.stringify(listPayload);
const envelope = [['wrb.fr', 'cdjF2', innerJsonString, null, null, null, 'generic']];

const rpcBody = ")]}'\n" + JSON.stringify(envelope);
writeFileSync(join(here, 'list-rpc.txt'), rpcBody);

const privatePayload = [['Sign in required to view this list'], null, []];
const privateInner = JSON.stringify(privatePayload);
const privateEnvelope = [['wrb.fr', 'cdjF2', privateInner, null, null, null, 'generic']];
const privateBody = ")]}'\n" + JSON.stringify(privateEnvelope);
writeFileSync(join(here, 'private-list-rpc.txt'), privateBody);

console.log('wrote list-rpc.txt and private-list-rpc.txt');
