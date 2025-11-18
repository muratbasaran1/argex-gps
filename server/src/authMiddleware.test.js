import assert from 'assert';
import crypto from 'crypto';
import { test } from 'node:test';

function resetEnv() {
  delete process.env.OIDC_JWT_SECRET;
  delete process.env.OIDC_JWKS_URL;
  delete process.env.OIDC_ISSUER;
  delete process.env.OIDC_AUDIENCE;
  delete process.env.ADMIN_ROLE;
}

function createHsToken(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const rawHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const rawPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${rawHeader}.${rawPayload}`).digest('base64url');
  return `${rawHeader}.${rawPayload}.${signature}`;
}

function createMockResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    header(name, value) {
      this.headers[name] = value;
      return this;
    },
    sendStatus(code) {
      this.statusCode = code;
      return this;
    },
  };
}

async function loadMiddleware() {
  return import(`./authMiddleware.js?update=${Date.now()}`);
}

test('requires issuer claim when issuer is configured', async () => {
  resetEnv();
  process.env.OIDC_JWT_SECRET = 'secret';
  process.env.OIDC_ISSUER = 'expected-issuer';

  const { requireAdmin } = await loadMiddleware();
  const token = createHsToken({ roles: ['admin'], aud: 'audience' }, 'secret');
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = createMockResponse();
  let nextCalled = false;

  await requireAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.message, 'unauthorized');
  assert.match(res.body.error, /issuer claim required/);
});

test('requires audience claim when audience is configured', async () => {
  resetEnv();
  process.env.OIDC_JWT_SECRET = 'secret';
  process.env.OIDC_AUDIENCE = 'expected-audience';

  const { requireAdmin } = await loadMiddleware();
  const token = createHsToken({ roles: ['admin'] }, 'secret');
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = createMockResponse();
  let nextCalled = false;

  await requireAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.message, 'forbidden');
  assert.match(res.body.error, /audience claim required/);
});

test('accepts valid token with required issuer and audience', async () => {
  resetEnv();
  process.env.OIDC_JWT_SECRET = 'secret';
  process.env.OIDC_AUDIENCE = 'expected-audience';
  process.env.OIDC_ISSUER = 'expected-issuer';

  const { requireAdmin } = await loadMiddleware();
  const token = createHsToken(
    { roles: ['admin'], aud: 'expected-audience', iss: 'expected-issuer' },
    'secret'
  );
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = createMockResponse();
  let nextCalled = false;

  await requireAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(res.statusCode, null);
  assert.strictEqual(nextCalled, true);
  assert.deepStrictEqual(req.user.roles.includes('admin'), true);
  assert.strictEqual(req.user.iss, 'expected-issuer');
  assert.strictEqual(req.user.aud, 'expected-audience');
});

