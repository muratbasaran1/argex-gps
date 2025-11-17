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
