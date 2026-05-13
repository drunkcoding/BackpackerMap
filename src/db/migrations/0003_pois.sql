CREATE TABLE source_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL CHECK (kind IN ('alltrails','airbnb','booking','google_maps')),
  ingested_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO source_new (id, kind, ingested_at)
  SELECT id, kind, ingested_at FROM source;
DROP TABLE source;
ALTER TABLE source_new RENAME TO source;

CREATE TABLE poi (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id     INTEGER NOT NULL REFERENCES source(id),
  collection    TEXT NOT NULL,
  external_id   TEXT NOT NULL,
  name          TEXT NOT NULL,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  category      TEXT,
  note          TEXT,
  url           TEXT,
  address       TEXT,
  raw           TEXT NOT NULL,
  ingested_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_id, external_id)
);
CREATE INDEX idx_poi_geo ON poi(lat, lng);
CREATE INDEX idx_poi_collection ON poi(collection);

DROP TABLE distance_cache;
CREATE TABLE route_cache (
  property_id   INTEGER NOT NULL REFERENCES property(id) ON DELETE CASCADE,
  target_kind   TEXT NOT NULL CHECK (target_kind IN ('trail','poi')),
  target_id     INTEGER NOT NULL,
  meters        REAL NOT NULL,
  seconds       REAL NOT NULL,
  computed_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (property_id, target_kind, target_id)
);
CREATE INDEX idx_route_cache_target ON route_cache(target_kind, target_id);
