function parseAllowedOrigins(rawOrigins) {
  return (rawOrigins || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadAllowedOrigins(env = process.env) {
  const origins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const nodeEnv = env.NODE_ENV || 'development';
  if (origins.length) {
    return { origins, source: 'env', set: new Set(origins), nodeEnv };
  }

  const sample = nodeEnv === 'development' ? ' Example: ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000' : '';
  const error = `ALLOWED_ORIGINS is required; set a comma-separated list of allowed origins before starting the server.${sample}`;

  return { origins: [], source: 'missing', set: null, nodeEnv, error };
}

export const allowedOriginsConfig = (() => {
  const config = loadAllowedOrigins();
  if (!config.set) {
    console.error(`[startup] ${config.error}`);
  }
  return config;
})();

export const corsMessages = {
  missingEnv:
    'CORS is not configured. Set ALLOWED_ORIGINS to a comma-separated list of approved origins before starting the server.',
};
