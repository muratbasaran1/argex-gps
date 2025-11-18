import assert from 'assert';
import express from 'express';
import http from 'http';
import { test } from 'node:test';
import teamsRoutes, { createTeamsRouter } from './teamsRoutes.js';

function buildTestApp(getPool = null) {
  const app = express();
  app.use(express.json());
  app.use('/api/teams', getPool ? createTeamsRouter({ getPool }) : teamsRoutes);
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

function createMockPool(teamExists = true) {
  const calls = { query: [], execute: [] };
  return {
    calls,
    async query(sql, params) {
      calls.query.push({ sql, params });
      if (sql.includes('FROM teams')) {
        return [[teamExists ? { id: params[0] } : undefined ]];
      }
      return [[]];
    },
    async execute(sql, params) {
      calls.execute.push({ sql, params });
      return [];
    },
  };
}

test('POST /api/teams/:id/locations rejects invalid coordinates and does not write', async () => {
  const pool = createMockPool();
  const app = buildTestApp(async () => pool);

  const res = await makeRequest(app, 'POST', '/api/teams/team-1/locations', { latitude: 200, longitude: 10 });

  assert.strictEqual(res.status, 400);
  assert.strictEqual(pool.calls.execute.length, 0);
});

test('POST /api/teams/:id/telemetry rejects invalid metrics and does not write', async () => {
  const pool = createMockPool();
  const app = buildTestApp(async () => pool);

  const res = await makeRequest(app, 'POST', '/api/teams/team-1/telemetry', { heartRate: -5 });

  assert.strictEqual(res.status, 400);
  assert.strictEqual(pool.calls.execute.length, 0);
});

test('POST /api/teams/:id/locations stores sanitized values', async () => {
  const pool = createMockPool();
  const app = buildTestApp(async () => pool);

  const res = await makeRequest(app, 'POST', '/api/teams/team-1/locations', {
    latitude: '42.5',
    longitude: '-71.2',
    accuracyMeters: '5',
    recordedAt: '2024-01-01T12:00:00.000Z',
  });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(pool.calls.execute.length, 1);
  const params = pool.calls.execute[0].params;
  assert.strictEqual(params[2], 42.5);
  assert.strictEqual(params[3], -71.2);
  assert.strictEqual(params[4], 5);
  assert.ok(params[5] instanceof Date);
});

test('POST /api/teams/:id/telemetry stores sanitized values', async () => {
  const pool = createMockPool();
  const app = buildTestApp(async () => pool);

  const res = await makeRequest(app, 'POST', '/api/teams/team-1/telemetry', {
    batteryLevel: '99',
    heartRate: '120',
    note: 'ok',
    recordedAt: '2024-01-01T12:00:00.000Z',
  });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(pool.calls.execute.length, 1);
  const params = pool.calls.execute[0].params;
  assert.strictEqual(params[2], 99);
  assert.strictEqual(params[3], 120);
  assert.strictEqual(params[4], 'ok');
  assert.ok(params[5] instanceof Date);
});
