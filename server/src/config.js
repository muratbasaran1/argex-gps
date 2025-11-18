const DEV_DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:3000'];

function isTruthy(value) {
  return String(value || '').toLowerCase() === 'true';
}

function parseAllowedOrigins(rawOrigins) {
  return (rawOrigins || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadAllowedOrigins(env = process.env) {
  const origins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  if (origins.length) {
    return { origins, source: 'env', enforceStartupFailure: false };
  }

  const nodeEnv = env.NODE_ENV || 'development';
  const devFallbackEnabled = isTruthy(env.ENABLE_DEV_CORS_FALLBACK);
  if (nodeEnv === 'development' && devFallbackEnabled) {
    return { origins: DEV_DEFAULT_ALLOWED_ORIGINS, source: 'dev-default', enforceStartupFailure: false };
  }

  const errorMessage =
    nodeEnv === 'production'
      ? 'ALLOWED_ORIGINS is required in production; set it to the comma-separated list of approved origins before starting the server.'
      : 'ALLOWED_ORIGINS is missing. Set it to your local client URLs or enable ENABLE_DEV_CORS_FALLBACK=true to use the localhost defaults while developing.';

  const enforceStartupFailure = nodeEnv === 'production' || !devFallbackEnabled;
  return { origins: [], source: 'missing', error: errorMessage, enforceStartupFailure };
}

export const allowedOriginsConfig = (() => {
  const config = loadAllowedOrigins();
  const set = config.origins.length ? new Set(config.origins) : null;
  return { ...config, set };
})();

export const corsMessages = {
  missingEnv:
    'CORS is not configured. Set ALLOWED_ORIGINS or enable ENABLE_DEV_CORS_FALLBACK=true in development to allow the localhost defaults.',
  devDefaultsInUse:
    'Using development fallback ALLOWED_ORIGINS values. Set ALLOWED_ORIGINS in production to restrict access to known clients.',
};
