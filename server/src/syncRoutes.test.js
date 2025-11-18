import assert from 'assert';
import express from 'express';
import http from 'http';
import { test } from 'node:test';
import syncRoutes from './syncRoutes.js';

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/sync', syncRoutes);
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

test('rejects invalid manifest URL for map packages', async () => {
  const app = buildTestApp();
  const res = await makeRequest(app, 'POST', '/api/sync/packages', {
    region: 'test',
    version: 'v1',
    manifestUrl: 'not-a-url',
  });

  assert.strictEqual(res.status, 400);
  assert.match(res.body.errors[0].message, /Invalid url/i);
});

test('rejects unsupported queue direction', async () => {
  const app = buildTestApp();
  const res = await makeRequest(app, 'POST', '/api/sync/packages/123/queue', {
    direction: 'sideways',
  });

  assert.strictEqual(res.status, 400);
  assert.match(res.body.errors[0].message, /Invalid enum value/i);
});

test('rejects tile coordinates outside allowed range', async () => {
  const app = buildTestApp();
  const res = await makeRequest(app, 'POST', '/api/sync/tiles', {
    region: 'test',
    zoom: -1,
    tileX: 0,
    tileY: 0,
  });

  assert.strictEqual(res.status, 400);
});

test('rejects negative retryCount updates', async () => {
  const app = buildTestApp();
  const res = await makeRequest(app, 'PUT', '/api/sync/queue/abc', {
    retryCount: -2,
  });

  assert.strictEqual(res.status, 400);
});
