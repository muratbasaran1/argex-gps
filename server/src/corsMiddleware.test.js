import assert from 'assert';
import { test } from 'node:test';
import { createCorsMiddleware } from './authMiddleware.js';
import { loadAllowedOrigins } from './config.js';

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

function buildConfig(env) {
  const config = loadAllowedOrigins(env);
  const set = config.origins.length ? new Set(config.origins) : null;
  return { ...config, set };
}

test('cors middleware enforces allowed origins', async (t) => {
  await t.test('warns and blocks when allowed origins are missing', async () => {
    const corsMiddleware = createCorsMiddleware(buildConfig({ NODE_ENV: 'development' }));
    const req = { headers: { origin: 'http://localhost:3000' }, method: 'GET', path: '/api' };
    const res = createMockResponse();
    let nextCalled = false;

    await corsMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.headers.Vary, 'Origin');
    assert.match(res.body.message, /ALLOWED_ORIGINS/);
  });

  await t.test('allows configured origins and forwards requests', async () => {
    const corsMiddleware = createCorsMiddleware(buildConfig({ ALLOWED_ORIGINS: 'https://admin.example.com' }));
    const req = { headers: { origin: 'https://admin.example.com' }, method: 'GET', path: '/api' };
    const res = createMockResponse();
    let nextCalled = false;

    await corsMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(res.statusCode, null);
    assert.strictEqual(res.headers['Access-Control-Allow-Origin'], 'https://admin.example.com');
    assert.strictEqual(res.headers['Access-Control-Allow-Credentials'], 'true');
    assert.strictEqual(res.headers.Vary, 'Origin');
  });

  await t.test('blocks disallowed origins', async () => {
    const corsMiddleware = createCorsMiddleware(buildConfig({ ALLOWED_ORIGINS: 'https://admin.example.com' }));
    const req = { headers: { origin: 'https://app.example.com' }, method: 'GET', path: '/api' };
    const res = createMockResponse();
    let nextCalled = false;

    await corsMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, {
      message: 'origin not allowed',
      allowedOrigins: ['https://admin.example.com'],
    });
  });

  await t.test('responds to preflight using development fallback origins', async () => {
    const corsMiddleware = createCorsMiddleware(
      buildConfig({ NODE_ENV: 'development', ENABLE_DEV_CORS_FALLBACK: 'true' })
    );
    const req = { headers: { origin: 'http://localhost:5173' }, method: 'OPTIONS', path: '/api' };
    const res = createMockResponse();
    let nextCalled = false;

    await corsMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 204);
    assert.strictEqual(res.headers['Access-Control-Allow-Origin'], 'http://localhost:5173');
    assert.strictEqual(res.headers['Access-Control-Allow-Methods'], 'GET,POST,PUT,DELETE,OPTIONS');
    assert.strictEqual(res.headers['Access-Control-Allow-Headers'], 'Content-Type, Authorization');
  });

  await t.test('passes through when origin header is absent', async () => {
    const corsMiddleware = createCorsMiddleware(buildConfig({ ALLOWED_ORIGINS: 'https://admin.example.com' }));
    const req = { headers: {}, method: 'GET', path: '/api' };
    const res = createMockResponse();
    let nextCalled = false;

    await corsMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(res.statusCode, null);
  });
});
