import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getDbPool } from './db.js';

const router = Router();
const publicMapsRouter = Router();

function mapRouteRow(row) {
  return {
    id: row.id,
    name: row.name,
    region: row.region,
    status: row.status,
    description: row.description || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapWaypointRow(row) {
  return {
    id: row.id,
    routeId: row.routeId,
    name: row.name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    orderIndex: row.orderIndex,
    etaSeconds: row.etaSeconds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function now() {
  return new Date();
}

async function getRouteById(pool, routeId) {
  const [rows] = await pool.query('SELECT * FROM map_routes WHERE id = ?', [routeId]);
  return rows[0] || null;
}

router.get('/routes', async (_req, res) => {
  try {
    const pool = await getDbPool();
    const [routes] = await pool.query('SELECT * FROM map_routes ORDER BY updatedAt DESC');
    res.json({ routes: routes.map(mapRouteRow) });
  } catch (error) {
    console.error('list routes failed', error);
    res.status(500).json({ message: 'routes listing failed' });
  }
});

router.post('/routes', async (req, res) => {
  try {
    const { name, region, status = 'draft', description = '' } = req.body || {};
    if (!name || !region) {
      return res.status(400).json({ message: 'name ve region zorunlu' });
    }
    const id = uuid();
    const timestamp = now();
    const pool = await getDbPool();
    await pool.execute(
      'INSERT INTO map_routes (id, name, region, status, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, name, region, status, description, timestamp, timestamp],
    );
    res.status(201).json({ route: { id, name, region, status, description, createdAt: timestamp, updatedAt: timestamp } });
  } catch (error) {
    console.error('create route failed', error);
    res.status(500).json({ message: 'route oluşturulamadı' });
  }
});

router.get('/routes/:routeId', async (req, res) => {
  try {
    const { routeId } = req.params;
    const pool = await getDbPool();
    const route = await getRouteById(pool, routeId);
    if (!route) return res.status(404).json({ message: 'rota bulunamadı' });

    const [waypoints] = await pool.query(
      'SELECT * FROM map_waypoints WHERE routeId = ? ORDER BY orderIndex ASC, createdAt ASC',
      [routeId],
    );
    res.json({ route: mapRouteRow(route), waypoints: waypoints.map(mapWaypointRow) });
  } catch (error) {
    console.error('get route failed', error);
    res.status(500).json({ message: 'rota alınamadı' });
  }
});

router.put('/routes/:routeId', async (req, res) => {
  try {
    const { routeId } = req.params;
    const { name, region, status, description } = req.body || {};
    const pool = await getDbPool();
    const existing = await getRouteById(pool, routeId);
    if (!existing) return res.status(404).json({ message: 'rota bulunamadı' });

    const patch = {
      name: name || existing.name,
      region: region || existing.region,
      status: status || existing.status,
      description: description ?? existing.description,
    };
    const timestamp = now();
    await pool.execute(
      'UPDATE map_routes SET name = ?, region = ?, status = ?, description = ?, updatedAt = ? WHERE id = ?',
      [patch.name, patch.region, patch.status, patch.description, timestamp, routeId],
    );
    res.json({ route: { ...mapRouteRow(existing), ...patch, updatedAt: timestamp } });
  } catch (error) {
    console.error('update route failed', error);
    res.status(500).json({ message: 'rota güncellenemedi' });
  }
});

router.delete('/routes/:routeId', async (req, res) => {
  try {
    const { routeId } = req.params;
    const pool = await getDbPool();
    const [result] = await pool.execute('DELETE FROM map_routes WHERE id = ?', [routeId]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'rota bulunamadı' });
    res.status(204).send();
  } catch (error) {
    console.error('delete route failed', error);
    res.status(500).json({ message: 'rota silinemedi' });
  }
});

router.post('/routes/:routeId/waypoints', async (req, res) => {
  try {
    const { routeId } = req.params;
    const { name, latitude, longitude, orderIndex = 0, etaSeconds = null } = req.body || {};
    if (!name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: 'name, latitude ve longitude zorunlu' });
    }

    const pool = await getDbPool();
    const route = await getRouteById(pool, routeId);
    if (!route) return res.status(404).json({ message: 'rota bulunamadı' });

    const id = uuid();
    const timestamp = now();
    await pool.execute(
      'INSERT INTO map_waypoints (id, routeId, name, latitude, longitude, orderIndex, etaSeconds, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, routeId, name, latitude, longitude, orderIndex, etaSeconds, timestamp, timestamp],
    );
    res.status(201).json({ waypoint: { id, routeId, name, latitude, longitude, orderIndex, etaSeconds, createdAt: timestamp, updatedAt: timestamp } });
  } catch (error) {
    console.error('create waypoint failed', error);
    res.status(500).json({ message: 'waypoint eklenemedi' });
  }
});

router.put('/routes/:routeId/waypoints/:waypointId', async (req, res) => {
  try {
    const { routeId, waypointId } = req.params;
    const { name, latitude, longitude, orderIndex, etaSeconds } = req.body || {};
    const pool = await getDbPool();
    const route = await getRouteById(pool, routeId);
    if (!route) return res.status(404).json({ message: 'rota bulunamadı' });

    const [existingRows] = await pool.query(
      'SELECT * FROM map_waypoints WHERE id = ? AND routeId = ?',
      [waypointId, routeId],
    );
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ message: 'waypoint bulunamadı' });

    const nextValues = {
      name: name || existing.name,
      latitude: latitude ?? existing.latitude,
      longitude: longitude ?? existing.longitude,
      orderIndex: orderIndex ?? existing.orderIndex,
      etaSeconds: etaSeconds ?? existing.etaSeconds,
    };
    const timestamp = now();
    await pool.execute(
      'UPDATE map_waypoints SET name = ?, latitude = ?, longitude = ?, orderIndex = ?, etaSeconds = ?, updatedAt = ? WHERE id = ? AND routeId = ?',
      [nextValues.name, nextValues.latitude, nextValues.longitude, nextValues.orderIndex, nextValues.etaSeconds, timestamp, waypointId, routeId],
    );
    res.json({ waypoint: { ...mapWaypointRow(existing), ...nextValues, updatedAt: timestamp } });
  } catch (error) {
    console.error('update waypoint failed', error);
    res.status(500).json({ message: 'waypoint güncellenemedi' });
  }
});

router.delete('/routes/:routeId/waypoints/:waypointId', async (req, res) => {
  try {
    const { routeId, waypointId } = req.params;
    const pool = await getDbPool();
    const [result] = await pool.execute('DELETE FROM map_waypoints WHERE id = ? AND routeId = ?', [waypointId, routeId]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'waypoint bulunamadı' });
    res.status(204).send();
  } catch (error) {
    console.error('delete waypoint failed', error);
    res.status(500).json({ message: 'waypoint silinemedi' });
  }
});

router.get('/tiles', async (_req, res) => {
  try {
    const pool = await getDbPool();
    const [packages] = await pool.query('SELECT * FROM map_packages ORDER BY updatedAt DESC');
    res.json({ packages });
  } catch (error) {
    console.error('list tiles failed', error);
    res.status(500).json({ message: 'paketler alınamadı' });
  }
});

publicMapsRouter.get('/tiles/manifest', async (_req, res) => {
  try {
    const pool = await getDbPool();
    const [packages] = await pool.query(
      'SELECT id, region, version, manifestUrl, sizeBytes, checksum, updatedAt FROM map_packages WHERE status = ? ORDER BY region, updatedAt DESC',
      ['ready'],
    );
    res.json({ packages });
  } catch (error) {
    console.error('public manifest failed', error);
    res.status(500).json({ message: 'manifest alınamadı' });
  }
});

publicMapsRouter.get('/tiles/:region/index', async (req, res) => {
  try {
    const { region } = req.params;
    const pool = await getDbPool();
    const [tiles] = await pool.query(
      'SELECT zoom, tileX, tileY, packageId, updatedAt FROM region_tiles WHERE region = ? ORDER BY zoom, tileX, tileY',
      [region],
    );
    res.json({ region, tiles });
  } catch (error) {
    console.error('public tile index failed', error);
    res.status(500).json({ message: 'tile index alınamadı' });
  }
});

export { publicMapsRouter };
export default router;
