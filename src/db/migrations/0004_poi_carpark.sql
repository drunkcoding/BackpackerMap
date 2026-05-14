CREATE TABLE poi_carpark (
  poi_id      INTEGER PRIMARY KEY REFERENCES poi(id) ON DELETE CASCADE,
  -- (lat,lng) = (NULL,NULL) is a "searched, nothing found" tombstone
  lat         REAL,
  lng         REAL,
  radius_m    INTEGER NOT NULL,
  fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE route_cache ADD COLUMN via_carpark_lat REAL;
ALTER TABLE route_cache ADD COLUMN via_carpark_lng REAL;
