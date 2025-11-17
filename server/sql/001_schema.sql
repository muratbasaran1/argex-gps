-- Base schema for mapping, sync, and team tracking domains
CREATE TABLE IF NOT EXISTS map_routes (
  id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  region VARCHAR(255) NOT NULL,
  status VARCHAR(32) DEFAULT 'draft',
  description TEXT,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS map_waypoints (
  id CHAR(36) NOT NULL,
  routeId CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  latitude DECIMAL(9,6) NOT NULL,
  longitude DECIMAL(9,6) NOT NULL,
  orderIndex INT DEFAULT 0,
  etaSeconds INT DEFAULT NULL,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_route_order (routeId, orderIndex),
  CONSTRAINT fk_waypoints_route FOREIGN KEY (routeId) REFERENCES map_routes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS map_packages (
  id CHAR(36) NOT NULL,
  region VARCHAR(255) NOT NULL,
  version VARCHAR(64) NOT NULL,
  manifestUrl TEXT,
  sizeBytes BIGINT,
  checksum VARCHAR(255),
  status VARCHAR(32) DEFAULT 'ready',
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS region_tiles (
  id CHAR(36) NOT NULL,
  region VARCHAR(255) NOT NULL,
  zoom SMALLINT NOT NULL,
  tileX INT NOT NULL,
  tileY INT NOT NULL,
  packageId CHAR(36),
  updatedAt DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY idx_region_tile (region, zoom, tileX, tileY),
  CONSTRAINT fk_region_tiles_package FOREIGN KEY (packageId) REFERENCES map_packages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sync_queue (
  id CHAR(36) NOT NULL,
  packageId CHAR(36),
  direction ENUM('upload','download') NOT NULL,
  status VARCHAR(32) DEFAULT 'pending',
  retryCount INT DEFAULT 0,
  lastError TEXT,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_sync_queue_status (status),
  CONSTRAINT fk_sync_package FOREIGN KEY (packageId) REFERENCES map_packages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL,
  username VARCHAR(255) NOT NULL UNIQUE,
  displayName VARCHAR(255),
  createdAt DATETIME NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS roles (
  id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL UNIQUE,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_roles (
  userId CHAR(36) NOT NULL,
  roleId CHAR(36) NOT NULL,
  PRIMARY KEY (userId, roleId),
  CONSTRAINT fk_user_role_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_role_role FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS teams (
  id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  callSign VARCHAR(100),
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS team_locations (
  id CHAR(36) NOT NULL,
  teamId CHAR(36) NOT NULL,
  latitude DECIMAL(9,6) NOT NULL,
  longitude DECIMAL(9,6) NOT NULL,
  accuracyMeters DECIMAL(8,2),
  recordedAt DATETIME NOT NULL,
  createdAt DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_team_location_time (teamId, recordedAt),
  CONSTRAINT fk_team_locations_team FOREIGN KEY (teamId) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS team_telemetry (
  id CHAR(36) NOT NULL,
  teamId CHAR(36) NOT NULL,
  batteryLevel DECIMAL(5,2),
  heartRate SMALLINT,
  note TEXT,
  recordedAt DATETIME NOT NULL,
  createdAt DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_team_telemetry_time (teamId, recordedAt),
  CONSTRAINT fk_team_telemetry_team FOREIGN KEY (teamId) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
