import assert from 'assert';
import { test } from 'node:test';

import { loadAllowedOrigins } from './config.js';

test('parses comma-separated origins into a trimmed list and set', () => {
  const env = { ALLOWED_ORIGINS: 'http://localhost:5173, https://example.com ' };

  const config = loadAllowedOrigins(env);

  assert.deepStrictEqual(config.origins, ['http://localhost:5173', 'https://example.com']);
  assert.deepStrictEqual(Array.from(config.set), ['http://localhost:5173', 'https://example.com']);
  assert.strictEqual(config.source, 'env');
  assert.strictEqual(config.nodeEnv, 'development');
});

test('deduplicates repeated origins while preserving order', () => {
  const env = { ALLOWED_ORIGINS: 'https://example.com,https://example.com,http://localhost' };

  const config = loadAllowedOrigins(env);

  assert.deepStrictEqual(config.origins, ['https://example.com', 'http://localhost']);
  assert.deepStrictEqual(Array.from(config.set), ['https://example.com', 'http://localhost']);
});

test('exposes a helpful error when origins are missing in development', () => {
  const env = { NODE_ENV: 'development' };

  const config = loadAllowedOrigins(env);

  assert.strictEqual(config.set, null);
  assert.strictEqual(config.nodeEnv, 'development');
  assert.match(config.error, /ALLOWED_ORIGINS is required/);
  assert.match(config.error, /ALLOWED_ORIGINS=http:\/\/localhost:5173,http:\/\/localhost:3000/);
});

test('omits development sample when NODE_ENV is production', () => {
  const env = { NODE_ENV: 'production' };

  const config = loadAllowedOrigins(env);

  assert.strictEqual(config.set, null);
  assert.strictEqual(config.nodeEnv, 'production');
  assert.strictEqual(config.error.includes('localhost'), false);
});
