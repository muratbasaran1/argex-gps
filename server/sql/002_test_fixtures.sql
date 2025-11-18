SET FOREIGN_KEY_CHECKS=0;
TRUNCATE TABLE region_tiles;
TRUNCATE TABLE map_waypoints;
TRUNCATE TABLE map_routes;
TRUNCATE TABLE map_packages;
SET FOREIGN_KEY_CHECKS=1;

INSERT INTO map_packages (id, region, version, manifestUrl, sizeBytes, checksum, status, createdAt, updatedAt)
VALUES
  ('pkg-ready', 'north', '1.0.0', 'https://cdn/maps/manifest-1.json', 1024, 'abc', 'ready', '2024-01-01 00:00:00', '2024-01-02 00:00:00'),
  ('pkg-pending', 'south', '0.9.0', 'https://cdn/maps/manifest-0.9.json', 2048, 'def', 'pending', '2024-01-01 00:00:00', '2024-01-01 12:00:00');

INSERT INTO map_routes (id, name, region, status, description, createdAt, updatedAt)
VALUES
  ('route-1', 'Test Route', 'north', 'active', 'primary test route', '2024-02-01 10:00:00', '2024-02-01 10:00:00');

INSERT INTO map_waypoints (id, routeId, name, latitude, longitude, orderIndex, etaSeconds, createdAt, updatedAt)
VALUES
  ('waypoint-1', 'route-1', 'Start', 40.000000, -70.000000, 0, 600, '2024-02-01 10:10:00', '2024-02-01 10:10:00'),
  ('waypoint-2', 'route-1', 'Finish', 41.000000, -71.000000, 1, 1200, '2024-02-01 10:20:00', '2024-02-01 10:20:00');

INSERT INTO region_tiles (id, region, zoom, tileX, tileY, packageId, updatedAt)
VALUES
  ('tile-1', 'north', 5, 10, 12, 'pkg-ready', '2024-03-01 00:00:00'),
  ('tile-2', 'north', 5, 10, 13, 'pkg-ready', '2024-03-01 00:05:00');
