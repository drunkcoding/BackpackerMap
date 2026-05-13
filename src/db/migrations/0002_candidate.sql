CREATE TABLE candidate (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  provider        TEXT NOT NULL CHECK (provider IN ('airbnb','booking')),
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
CREATE INDEX idx_candidate_geo ON candidate(lat, lng);

CREATE TABLE search_cache (
  cache_key       TEXT PRIMARY KEY,
  query_json      TEXT NOT NULL,
  provider        TEXT NOT NULL,
  candidate_ids   TEXT NOT NULL,
  fetched_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_search_cache_fetched ON search_cache(fetched_at);

ALTER TABLE property ADD COLUMN promoted_from_candidate_id INTEGER
  REFERENCES candidate(id) ON DELETE SET NULL;
