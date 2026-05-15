-- Cache for driving routes from Discover candidates (not yet promoted to
-- property). Same shape as route_cache, keyed by candidate_id instead of
-- property_id. On promotion the rows are copied into route_cache; the FK
-- CASCADE handles the case where the candidate is later pruned.
CREATE TABLE candidate_route_cache (
  candidate_id    INTEGER NOT NULL REFERENCES candidate(id) ON DELETE CASCADE,
  target_kind     TEXT NOT NULL CHECK (target_kind IN ('trail','poi')),
  target_id       INTEGER NOT NULL,
  meters          REAL NOT NULL,
  seconds         REAL NOT NULL,
  computed_at     TEXT NOT NULL DEFAULT (datetime('now')),
  via_carpark_lat REAL,
  via_carpark_lng REAL,
  geometry        TEXT,
  PRIMARY KEY (candidate_id, target_kind, target_id)
);
CREATE INDEX idx_candidate_route_cache_target
  ON candidate_route_cache(target_kind, target_id);
