import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getDbPool } from './db.js';

const router = Router();

function now() {
  return new Date();
}

function mapTeam(row) {
  return {
    id: row.id,
    name: row.name,
    callSign: row.callSign,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

router.get('/', async (_req, res) => {
  try {
    const pool = await getDbPool();
    const [teams] = await pool.query('SELECT * FROM teams ORDER BY updatedAt DESC');
    res.json({ teams: teams.map(mapTeam) });
  } catch (error) {
    console.error('teams fetch failed', error);
    res.status(500).json({ message: 'takımlar alınamadı' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, callSign = '' } = req.body || {};
    if (!name) return res.status(400).json({ message: 'team name zorunlu' });
    const id = uuid();
    const timestamp = now();
    const pool = await getDbPool();
    await pool.execute(
      'INSERT INTO teams (id, name, callSign, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
      [id, name, callSign, timestamp, timestamp],
    );
    res.status(201).json({ team: { id, name, callSign, createdAt: timestamp, updatedAt: timestamp } });
  } catch (error) {
    console.error('team create failed', error);
    res.status(500).json({ message: 'takım oluşturulamadı' });
  }
});

router.get('/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const pool = await getDbPool();
    const [teams] = await pool.query('SELECT * FROM teams WHERE id = ?', [teamId]);
    const team = teams[0];
    if (!team) return res.status(404).json({ message: 'takım bulunamadı' });

    const [latestLocation] = await pool.query(
      'SELECT * FROM team_locations WHERE teamId = ? ORDER BY recordedAt DESC LIMIT 1',
      [teamId],
    );
    const [latestTelemetry] = await pool.query(
      'SELECT * FROM team_telemetry WHERE teamId = ? ORDER BY recordedAt DESC LIMIT 1',
      [teamId],
    );

    res.json({
      team: mapTeam(team),
      latestLocation: latestLocation[0] || null,
      latestTelemetry: latestTelemetry[0] || null,
    });
  } catch (error) {
    console.error('team detail failed', error);
    res.status(500).json({ message: 'takım detayı alınamadı' });
  }
});

router.post('/:teamId/locations', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { latitude, longitude, accuracyMeters = null, recordedAt = null } = req.body || {};
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: 'latitude ve longitude zorunludur' });
    }
    const pool = await getDbPool();
    const [teams] = await pool.query('SELECT id FROM teams WHERE id = ?', [teamId]);
    if (!teams[0]) return res.status(404).json({ message: 'takım bulunamadı' });

    const id = uuid();
    const timestamp = now();
    const recorded = recordedAt ? new Date(recordedAt) : timestamp;
    await pool.execute(
      'INSERT INTO team_locations (id, teamId, latitude, longitude, accuracyMeters, recordedAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, teamId, latitude, longitude, accuracyMeters, recorded, timestamp],
    );
    res.status(201).json({ location: { id, teamId, latitude, longitude, accuracyMeters, recordedAt: recorded, createdAt: timestamp } });
  } catch (error) {
    console.error('location create failed', error);
    res.status(500).json({ message: 'konum kaydedilemedi' });
  }
});

router.get('/:teamId/locations', async (req, res) => {
  try {
    const { teamId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const pool = await getDbPool();
    const [rows] = await pool.query(
      'SELECT * FROM team_locations WHERE teamId = ? ORDER BY recordedAt DESC LIMIT ?',
      [teamId, limit],
    );
    res.json({ locations: rows });
  } catch (error) {
    console.error('locations fetch failed', error);
    res.status(500).json({ message: 'konumlar alınamadı' });
  }
});

router.post('/:teamId/telemetry', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { batteryLevel = null, heartRate = null, note = '', recordedAt = null } = req.body || {};
    const pool = await getDbPool();
    const [teams] = await pool.query('SELECT id FROM teams WHERE id = ?', [teamId]);
    if (!teams[0]) return res.status(404).json({ message: 'takım bulunamadı' });

    const id = uuid();
    const timestamp = now();
    const recorded = recordedAt ? new Date(recordedAt) : timestamp;
    await pool.execute(
      'INSERT INTO team_telemetry (id, teamId, batteryLevel, heartRate, note, recordedAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, teamId, batteryLevel, heartRate, note, recorded, timestamp],
    );
    res.status(201).json({ telemetry: { id, teamId, batteryLevel, heartRate, note, recordedAt: recorded, createdAt: timestamp } });
  } catch (error) {
    console.error('telemetry create failed', error);
    res.status(500).json({ message: 'telemetri kaydedilemedi' });
  }
});

router.get('/:teamId/telemetry', async (req, res) => {
  try {
    const { teamId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const pool = await getDbPool();
    const [rows] = await pool.query(
      'SELECT * FROM team_telemetry WHERE teamId = ? ORDER BY recordedAt DESC LIMIT ?',
      [teamId, limit],
    );
    res.json({ telemetry: rows });
  } catch (error) {
    console.error('telemetry fetch failed', error);
    res.status(500).json({ message: 'telemetri alınamadı' });
  }
});

export default router;
