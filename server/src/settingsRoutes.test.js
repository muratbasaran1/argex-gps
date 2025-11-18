import assert from 'assert';
import http from 'http';
import express from 'express';
import { test } from 'node:test';
import { createPublicSettingsRouter, createSettingsRouter } from './settingsRoutes.js';
import { SettingConflictError } from './settingsStore.js';

function buildTestApp(store, options = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api/settings/public', createPublicSettingsRouter(store));
  app.use('/api/settings', createSettingsRouter(store, options));
  app.use((err, _req, res, _next) => {
    res.status(500).json({ message: err.message });
  });
  return app;
}

async function makeRequest(app, method, path, body) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  await new Promise((resolve) => server.close(resolve));
  return { status: response.status, body: json };
}

test('GET /api/settings calls listSettings and masks secrets', async () => {
  const calls = [];
  const store = {
    listSettings: async () => {
      calls.push('list');
      return [
        { id: '1', key: 'public.demo', value: 'visible', secret: false, updatedAt: 'now' },
        { id: '2', key: 'secret.setting', value: 'hidden', secret: true, updatedAt: 'now' },
      ];
    },
  };

  const app = buildTestApp(store);
  const res = await makeRequest(app, 'GET', '/api/settings');
  assert.deepStrictEqual(calls, ['list']);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.settings[1].value, '***');
  assert.strictEqual(res.body.settings[1].masked, true);
});

test('GET /api/settings/public only returns client visible settings', async () => {
  const store = {
    listSettings: async () => [
      { key: 'public.value', value: 'a', secret: false, updatedAt: 'now' },
      { key: 'secret.value', value: 'b', secret: false, updatedAt: 'now' },
      { key: 'cdn.asset', value: 'cdn', secret: false, updatedAt: 'now' },
    ],
  };

  const app = buildTestApp(store);
  const res = await makeRequest(app, 'GET', '/api/settings/public');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body.settings, [
    { key: 'public.value', value: 'a', updatedAt: 'now' },
    { key: 'cdn.asset', value: 'cdn', updatedAt: 'now' },
  ]);
});

test('GET /api/settings/public exposes allowlisted defaults with normalized keys', async () => {
  const store = {
    listSettings: async () => [
      { key: 'SETTINGS_DEFAULT_REGION', value: 'na', secret: false, updatedAt: 'today' },
      { key: 'SETTINGS_DEFAULT_MAP_STYLE', value: 'outdoors', secret: false, updatedAt: 'today' },
      { key: 'SETTINGS_FEATURE_FLAGS', value: 'offline-sync,map-packages', secret: false, updatedAt: 'today' },
      { key: 'SETTINGS_UNLISTED', value: 'ignore-me', secret: false, updatedAt: 'today' },
    ],
  };

  const app = buildTestApp(store);
  const res = await makeRequest(app, 'GET', '/api/settings/public');

  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body.settings, [
    { key: 'public.settings.defaultRegion', value: 'na', updatedAt: 'today' },
    { key: 'public.settings.defaultMapStyle', value: 'outdoors', updatedAt: 'today' },
    {
      key: 'public.settings.featureFlags',
      value: 'offline-sync,map-packages',
      updatedAt: 'today',
    },
  ]);
});

test('POST /api/settings validates payload and forwards to store', async () => {
  const calls = [];
  const store = {
    createSetting: async (payload) => {
      calls.push(payload);
      return { ...payload, id: '10', secret: Boolean(payload.secret), updatedAt: 'now' };
    },
  };

  const app = buildTestApp(store);
  const res = await makeRequest(app, 'POST', '/api/settings', {
    key: 'test.key',
    value: '123',
    description: 'desc',
    secret: true,
  });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].key, 'test.key');
  assert.strictEqual(res.body.setting.masked, true);
});

test('POST /api/settings returns conflict when store throws SettingConflictError', async () => {
  const store = {
    createSetting: async () => {
      throw new SettingConflictError('dup');
    },
  };
  const app = buildTestApp(store);

  const res = await makeRequest(app, 'POST', '/api/settings', { key: 'dup', value: 'x' });
  assert.strictEqual(res.status, 409);
});

test('PUT /api/settings/:id returns 404 when missing', async () => {
  const store = {
    updateSetting: async () => null,
  };
  const app = buildTestApp(store);
  const res = await makeRequest(app, 'PUT', '/api/settings/1', { key: 'valid-key' });
  assert.strictEqual(res.status, 404);
});

test('DELETE /api/settings/:id invokes cleanup hook', async () => {
  const store = {
    deleteSetting: async () => ({ id: '1', key: 'demo', value: 'v', secret: false, updatedAt: 'now' }),
  };
  const cleanupCalls = [];
  const app = buildTestApp(store, {
    cleaner: async (key) => {
      cleanupCalls.push(key);
      return { failures: [], results: [], success: true };
    },
  });

  const res = await makeRequest(app, 'DELETE', '/api/settings/1');
  assert.deepStrictEqual(cleanupCalls, ['demo']);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.removed.key, 'demo');
});
