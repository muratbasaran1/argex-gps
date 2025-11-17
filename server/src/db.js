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
    const mysql = await loadMysqlModule();
    const config = buildPoolConfig();
    const pool = await mysql.createPool(config);
    await ensureSettingsSchema(pool);
    poolPromise = Promise.resolve(pool);
  }
  return poolPromise;
}
