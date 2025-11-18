import assert from 'node:assert';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import express from 'express';
import { before, beforeEach, test } from 'node:test';
import request from 'supertest';

process.env.OIDC_JWT_SECRET = process.env.OIDC_JWT_SECRET || 'test-secret';
process.env.ADMIN_ROLE = process.env.ADMIN_ROLE || 'admin';
process.env.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || 'http://localhost';

const { default: mapsRoutes, publicMapsRouter } = await import('./mapsRoutes.js');
const { requireAdmin } = await import('./authMiddleware.js');
const { getDbPool } = await import('./db.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(__dirname, '../sql/002_test_fixtures.sql');
let pool;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/maps/public', publicMapsRouter);
  app.use('/api/maps', requireAdmin, mapsRoutes);
  app.use((err, _req, res, _next) => {
    res.status(500).json({ message: err.message });
  });
  return app;
}

async function loadFixtures() {
  const sql = await fs.readFile(fixturePath, 'utf8');
  const statements = sql
    .split(/;\s*\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const statement of statements) {
    // eslint-disable-next-line no-await-in-loop
    await pool.query(statement);
  }
}

function createToken(roles = ['admin']) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'test-user',
      roles,
      iat: Math.floor(Date.now() / 1000),
    }),
  ).toString('base64url');
  const data = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', process.env.OIDC_JWT_SECRET).update(data).digest('base64url');
  return `${data}.${signature}`;
}

before(async () => {
  pool = await getDbPool();
});

beforeEach(async () => {
  await loadFixtures();
});

test('GET /api/maps/public/tiles/manifest lists ready packages only', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/maps/public/tiles/manifest');

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.packages.length, 1);
  assert.deepStrictEqual(res.body.packages[0].id, 'pkg-ready');
  assert.strictEqual(res.body.packages[0].region, 'north');
});

test('GET /api/maps/public/tiles/:region/index returns tiles for the region', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/maps/public/tiles/north/index');

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.region, 'north');
  assert.strictEqual(res.body.tiles.length, 2);
  assert.deepStrictEqual(res.body.tiles[0], {
    zoom: 5,
    tileX: 10,
    tileY: 12,
    packageId: 'pkg-ready',
    updatedAt: '2024-03-01 00:00:00',
  });
});

test('GET /api/maps/routes rejects missing bearer token', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/maps/routes');
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.message, 'missing bearer token');
});

test('GET /api/maps/routes enforces admin role', async () => {
  const app = buildApp();
  const token = createToken(['viewer']);
  const res = await request(app).get('/api/maps/routes').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.message, 'forbidden');
});

test('GET /api/maps/routes returns seeded routes for admins', async () => {
  const app = buildApp();
  const token = createToken();
  const res = await request(app).get('/api/maps/routes').set('Authorization', `Bearer ${token}`);

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.routes.length, 1);
  assert.strictEqual(res.body.routes[0].id, 'route-1');
  assert.strictEqual(res.body.routes[0].region, 'north');
});

test('POST /api/maps/routes creates a route when payload is valid', async () => {
  const app = buildApp();
  const token = createToken();
  const res = await request(app)
    .post('/api/maps/routes')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'New Route',
      region: 'east',
      status: 'draft',
      description: 'temporary',
    });

  assert.strictEqual(res.status, 201);
  assert.ok(res.body.route.id);
  const [rows] = await pool.query('SELECT * FROM map_routes WHERE name = ?', ['New Route']);
  assert.strictEqual(rows.length, 1);
});

test('POST /api/maps/routes rejects invalid body and leaves data intact', async () => {
  const app = buildApp();
  const token = createToken();
  const initial = await pool.query('SELECT COUNT(*) as count FROM map_routes');

  const res = await request(app)
    .post('/api/maps/routes')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '', region: '' });

  const [[{ count }]] = await pool.query('SELECT COUNT(*) as count FROM map_routes');
  assert.strictEqual(res.status, 400);
  assert.strictEqual(count, initial[0][0].count);
});

test('GET /api/maps/routes/:routeId returns 404 for missing routes', async () => {
  const app = buildApp();
  const token = createToken();
  const res = await request(app).get('/api/maps/routes/missing-route').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.message, 'rota bulunamadı');
});

test('PUT /api/maps/routes/:routeId updates route fields', async () => {
  const app = buildApp();
  const token = createToken();
  const res = await request(app)
    .put('/api/maps/routes/route-1')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Updated Route', status: 'archived' });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.route.name, 'Updated Route');
  assert.strictEqual(res.body.route.status, 'archived');
});

test('DELETE /api/maps/routes/:routeId removes existing routes', async () => {
  const app = buildApp();
  const token = createToken();
  const res = await request(app)
    .delete('/api/maps/routes/route-1')
    .set('Authorization', `Bearer ${token}`);

  const [[{ count }]] = await pool.query('SELECT COUNT(*) as count FROM map_routes WHERE id = ?', ['route-1']);
  assert.strictEqual(res.status, 204);
  assert.strictEqual(count, 0);
});
