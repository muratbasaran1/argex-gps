const DEV_DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:3000'];

function parseAllowedOrigins(rawOrigins) {
  return (rawOrigins || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadAllowedOrigins(env = process.env) {
  const origins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  if (origins.length) {
    return { origins, source: 'env' };
  }

  const nodeEnv = env.NODE_ENV || 'development';
  if (nodeEnv === 'development') {
    return { origins: DEV_DEFAULT_ALLOWED_ORIGINS, source: 'dev-default' };
  }

  return { origins: [], source: 'missing' };
}

export const allowedOriginsConfig = (() => {
  const config = loadAllowedOrigins();
  const set = config.origins.length ? new Set(config.origins) : null;
  return { ...config, set };
})();

export const corsMessages = {
  missingEnv:
    'CORS is not configured. Set ALLOWED_ORIGINS to a comma-separated list of approved origins before starting the server.',
  devDefaultsInUse:
    'Using development fallback ALLOWED_ORIGINS values. Set ALLOWED_ORIGINS in production to restrict access to known clients.',
};
