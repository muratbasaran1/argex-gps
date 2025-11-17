let mysqlModulePromise;

async function loadMysqlModule() {
  if (!mysqlModulePromise) {
    mysqlModulePromise = import('mysql2/promise');
  }
  return mysqlModulePromise;
}

function parseDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  const pathname = url.pathname?.replace(/^\//, '') || undefined;
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    user: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    database: pathname,
  };
}

function buildPoolConfig() {
  const baseConfig = {
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true,
  };

  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    return { ...baseConfig, ...parseDatabaseUrl(databaseUrl) };
  }

  return {
    ...baseConfig,
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'settings_service',
  };
}

async function ensureSettingsSchema(pool) {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      id CHAR(36) NOT NULL,
      \`key\` VARCHAR(255) NOT NULL,
      value TEXT NOT NULL,
      description TEXT DEFAULT '',
      secret TINYINT(1) DEFAULT 0,
      updatedAt DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY idx_settings_key (\`key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const [secretColumn] = await pool.execute('SHOW COLUMNS FROM settings LIKE "secret"');
  if (!secretColumn || secretColumn.length === 0) {
    await pool.execute('ALTER TABLE settings ADD COLUMN secret TINYINT(1) DEFAULT 0 AFTER description');
    await pool.execute('UPDATE settings SET secret = 0 WHERE secret IS NULL');
  }
}

async function ensureOperationalSchema(pool) {
  await pool.execute(`
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
  `);

  await pool.execute(`
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
  `);

  await pool.execute(`
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
  `);

  await pool.execute(`
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
  `);

  await pool.execute(`
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
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id CHAR(36) NOT NULL,
      username VARCHAR(255) NOT NULL UNIQUE,
      displayName VARCHAR(255),
      createdAt DATETIME NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS roles (
      id CHAR(36) NOT NULL,
      name VARCHAR(100) NOT NULL UNIQUE,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS user_roles (
      userId CHAR(36) NOT NULL,
      roleId CHAR(36) NOT NULL,
      PRIMARY KEY (userId, roleId),
      CONSTRAINT fk_user_role_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_user_role_role FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS teams (
      id CHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      callSign VARCHAR(100),
      createdAt DATETIME NOT NULL,
      updatedAt DATETIME NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.execute(`
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
  `);

  await pool.execute(`
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
  `);
}

let poolPromise;

export async function getDbPool() {
  if (!poolPromise) {
    poolPromise = (async () => {
      const mysql = await loadMysqlModule();
      const config = buildPoolConfig();
      return createPoolWithRetry(mysql, config);
    })();
  }
  return poolPromise;
}

async function createPoolWithRetry(mysql, config, options = {}) {
  const {
    maxAttempts = 5,
    delayMs = 5000,
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let pool;
    try {
      pool = await mysql.createPool(config);
      await ensureSettingsSchema(pool);
      await ensureOperationalSchema(pool);
      return pool;
    } catch (error) {
      if (pool) {
        try {
          await pool.end();
        } catch (closeError) {
          console.error(
            `Failed to close database pool after initialization error: ${closeError?.message || closeError}`,
          );
        }
      }

      console.error(
        `Database initialization attempt ${attempt} failed: ${error?.message || error}`,
      );

      if (attempt === maxAttempts) {
        throw new Error('Unable to initialize database connection after multiple attempts.');
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error('Unable to initialize database connection after multiple attempts.');
}
