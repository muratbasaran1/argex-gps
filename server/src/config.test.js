import assert from 'assert';
import { test } from 'node:test';
import { loadAllowedOrigins } from './config.js';

test('prefers explicit ALLOWED_ORIGINS values over fallbacks', () => {
  const env = { ALLOWED_ORIGINS: ' https://admin.example.com , https://app.example.com ' };
  const result = loadAllowedOrigins(env);

  assert.deepStrictEqual(result.origins, ['https://admin.example.com', 'https://app.example.com']);
  assert.strictEqual(result.source, 'env');
  assert.strictEqual(result.enforceStartupFailure, false);
});

test('uses dev defaults when fallback is enabled during development', () => {
  const env = { NODE_ENV: 'development', ENABLE_DEV_CORS_FALLBACK: 'true' };
  const result = loadAllowedOrigins(env);

  assert.deepStrictEqual(result.origins, ['http://localhost:5173', 'http://localhost:3000']);
  assert.strictEqual(result.source, 'dev-default');
  assert.strictEqual(result.enforceStartupFailure, false);
});

test('requires ALLOWED_ORIGINS in production', () => {
  const env = { NODE_ENV: 'production' };
  const result = loadAllowedOrigins(env);

  assert.strictEqual(result.source, 'missing');
  assert.strictEqual(result.enforceStartupFailure, true);
  assert.match(result.error, /ALLOWED_ORIGINS is required in production/);
});

test('reports missing CORS configuration in development when fallback is disabled', () => {
  const env = { NODE_ENV: 'development', ENABLE_DEV_CORS_FALLBACK: 'false' };
  const result = loadAllowedOrigins(env);

  assert.strictEqual(result.source, 'missing');
  assert.strictEqual(result.enforceStartupFailure, true);
  assert.match(result.error, /ALLOWED_ORIGINS is missing/);
});
