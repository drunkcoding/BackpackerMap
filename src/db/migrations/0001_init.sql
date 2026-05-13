CREATE TABLE source (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL CHECK (kind IN ('alltrails','airbnb','booking')),
  ingested_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE trail (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id             INTEGER NOT NULL REFERENCES source(id),
  external_id           TEXT,
  name                  TEXT NOT NULL,
  trailhead_lat         REAL NOT NULL,
  trailhead_lng         REAL NOT NULL,
  length_meters         REAL,
  elevation_gain_meters REAL,
  geojson               TEXT NOT NULL,
  raw_path              TEXT NOT NULL,
  UNIQUE (source_id, external_id)
);
CREATE INDEX idx_trail_geo ON trail(trailhead_lat, trailhead_lng);

CREATE TABLE property (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id     INTEGER NOT NULL REFERENCES source(id),
  provider      TEXT NOT NULL CHECK (provider IN ('airbnb','booking')),
  external_id   TEXT NOT NULL,
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  lat           REAL,
  lng           REAL,
  price_label   TEXT,
  photo_url     TEXT,
  raw_json      TEXT NOT NULL,
  enriched_at   TEXT,
  UNIQUE (provider, external_id)
);
CREATE INDEX idx_property_geo ON property(lat, lng);

CREATE TABLE distance_cache (
  property_id   INTEGER NOT NULL REFERENCES property(id) ON DELETE CASCADE,
  trail_id      INTEGER NOT NULL REFERENCES trail(id) ON DELETE CASCADE,
  meters        REAL NOT NULL,
  seconds       REAL NOT NULL,
  computed_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (property_id, trail_id)
);
