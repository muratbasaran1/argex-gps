import crypto from 'crypto';

const defaultAllowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const adminRole = process.env.ADMIN_ROLE || 'admin';
const issuer = process.env.OIDC_ISSUER;
const audience = process.env.OIDC_AUDIENCE;
const jwksUrl = process.env.OIDC_JWKS_URL;
const sharedSecret = process.env.OIDC_JWT_SECRET;
const jwksTtlMs = 5 * 60 * 1000;

let jwksCache = { keys: [], fetchedAt: 0 };

function base64UrlToBuffer(segment) {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, 'base64');
}

function parseJwtParts(token) {
  const [rawHeader, rawPayload, signature] = token.split('.');
  if (!rawHeader || !rawPayload || !signature) {
    throw new Error('invalid token format');
  }
  const header = JSON.parse(base64UrlToBuffer(rawHeader).toString('utf8'));
  const payload = JSON.parse(base64UrlToBuffer(rawPayload).toString('utf8'));
  return { header, payload, rawHeader, rawPayload, signature };
}

async function loadJwks() {
  if (!jwksUrl) return null;
  const now = Date.now();
  if (jwksCache.keys.length && now - jwksCache.fetchedAt < jwksTtlMs) {
    return jwksCache.keys;
  }
  const response = await fetch(jwksUrl);
  if (!response.ok) {
    throw new Error(`jwks fetch failed: ${response.status}`);
  }
  const json = await response.json();
  const keys = json.keys || [];
  jwksCache = { keys, fetchedAt: now };
  return keys;
}

async function verifyRsToken({ rawHeader, rawPayload, signature, header }) {
  const keys = await loadJwks();
  if (!keys) {
    throw new Error('missing jwks configuration');
  }
  const jwk = keys.find((key) => key.kid === header.kid && key.alg === header.alg) || keys[0];
  if (!jwk) {
    throw new Error('jwks key not found');
  }
  const key = await crypto.webcrypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const data = new TextEncoder().encode(`${rawHeader}.${rawPayload}`);
  const signatureBytes = base64UrlToBuffer(signature);
  const verified = await crypto.webcrypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signatureBytes, data);
  if (!verified) {
    throw new Error('signature verification failed');
  }
}

async function verifyHsToken({ rawHeader, rawPayload, signature }) {
  if (!sharedSecret) {
    throw new Error('missing jwt secret');
  }
  const expected = crypto.createHmac('sha256', sharedSecret).update(`${rawHeader}.${rawPayload}`).digest();
  const provided = base64UrlToBuffer(signature);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    throw new Error('signature verification failed');
  }
}

async function verifyJwt(token) {
  const { header, payload, rawHeader, rawPayload, signature } = parseJwtParts(token);
  if (header.alg !== 'RS256' && header.alg !== 'HS256') {
    throw new Error(`unsupported jwt algorithm: ${header.alg}`);
  }
  if (header.alg === 'RS256') {
    await verifyRsToken({ header, rawHeader, rawPayload, signature });
  } else {
    await verifyHsToken({ rawHeader, rawPayload, signature });
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error('token expired');
  }
  if (issuer && payload.iss && payload.iss !== issuer) {
    throw new Error('issuer mismatch');
  }
  if (audience) {
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (payload.aud && !aud.includes(audience)) {
      throw new Error('audience mismatch');
    }
  }
  return payload;
}

function collectRoles(payload) {
  const roles = new Set();
  if (Array.isArray(payload.roles)) {
    payload.roles.forEach((role) => roles.add(role));
  }
  if (payload.role) roles.add(payload.role);
  if (payload.realm_access?.roles) {
    payload.realm_access.roles.forEach((role) => roles.add(role));
  }
  if (payload.resource_access) {
    Object.values(payload.resource_access).forEach((entry) => {
      (entry.roles || []).forEach((role) => roles.add(role));
    });
  }
  return roles;
}

export async function requireAdmin(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    if (!auth.toLowerCase().startsWith('bearer ')) {
      return res.status(401).json({ message: 'missing bearer token' });
    }
    const token = auth.slice('bearer '.length).trim();
    const payload = await verifyJwt(token);
    const roles = collectRoles(payload);
    if (!roles.has(adminRole)) {
      return res.status(403).json({ message: 'insufficient role' });
    }
    req.user = { ...payload, roles: Array.from(roles) };
    return next();
  } catch (error) {
    console.error('auth failed', error);
    return res.status(401).json({ message: 'unauthorized', error: error.message });
  }
}

export function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next();
  const allowedOrigins = new Set(defaultAllowedOrigins);
  if (allowedOrigins.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  }
  res.header('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.sendStatus(403);
  return res.status(403).json({ message: 'origin not allowed' });
}
