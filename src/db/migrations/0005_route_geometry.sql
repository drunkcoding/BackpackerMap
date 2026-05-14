-- geometry: JSON [[lng, lat], ...] from ORS (geometry_simplify=true).
-- NULL = pre-migration row; frontend falls back to the straight connection line.
ALTER TABLE route_cache ADD COLUMN geometry TEXT;
