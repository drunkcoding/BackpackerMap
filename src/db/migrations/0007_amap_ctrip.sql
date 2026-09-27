-- Widen provider/kind CHECK constraints to allow the China accommodation provider (ctrip).
-- Rebuild order: candidate -> source -> property. foreign_keys is OFF (runner);
-- ids are preserved so route_cache / candidate_route_cache stay valid.

CREATE TABLE candidate_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  provider        TEXT NOT NULL CHECK (provider IN ('airbnb','booking','amap','ctrip')),
  external_id     TEXT NOT NULL,
  name            TEXT NOT NULL,
  url             TEXT NOT NULL,
  lat             REAL NOT NULL,
  lng             REAL NOT NULL,
  price_label     TEXT,
  price_amount    REAL,
  currency        TEXT,
  photo_url       TEXT,
  rating          REAL,
  review_count    INTEGER,
  raw_json        TEXT NOT NULL,
  first_seen_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider, external_id)
);
INSERT INTO candidate_new
  SELECT id, provider, external_id, name, url, lat, lng, price_label, price_amount,
         currency, photo_url, rating, review_count, raw_json, first_seen_at, last_seen_at
  FROM candidate;
DROP TABLE candidate;
ALTER TABLE candidate_new RENAME TO candidate;
CREATE INDEX idx_candidate_geo ON candidate(lat, lng);

CREATE TABLE source_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL CHECK (kind IN ('alltrails','airbnb','booking','google_maps','amap','ctrip')),
  ingested_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO source_new (id, kind, ingested_at) SELECT id, kind, ingested_at FROM source;
DROP TABLE source;
ALTER TABLE source_new RENAME TO source;

CREATE TABLE property_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id     INTEGER NOT NULL REFERENCES source(id),
  provider      TEXT NOT NULL CHECK (provider IN ('airbnb','booking','amap','ctrip')),
  external_id   TEXT NOT NULL,
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  lat           REAL,
  lng           REAL,
  price_label   TEXT,
  photo_url     TEXT,
  raw_json      TEXT NOT NULL,
  enriched_at   TEXT,
  promoted_from_candidate_id INTEGER REFERENCES candidate(id) ON DELETE SET NULL,
  UNIQUE (provider, external_id)
);
INSERT INTO property_new
  SELECT id, source_id, provider, external_id, name, url, lat, lng, price_label,
         photo_url, raw_json, enriched_at, promoted_from_candidate_id
  FROM property;
DROP TABLE property;
ALTER TABLE property_new RENAME TO property;
CREATE INDEX idx_property_geo ON property(lat, lng);
