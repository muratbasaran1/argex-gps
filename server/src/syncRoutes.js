import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getDbPool } from './db.js';

const router = Router();

function now() {
  return new Date();
}

function mapPackageRow(row) {
  return {
    id: row.id,
    region: row.region,
    version: row.version,
    manifestUrl: row.manifestUrl,
    sizeBytes: row.sizeBytes,
    checksum: row.checksum,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapTileRow(row) {
  return {
    id: row.id,
    region: row.region,
    zoom: Number(row.zoom),
    tileX: Number(row.tileX),
    tileY: Number(row.tileY),
    packageId: row.packageId,
    updatedAt: row.updatedAt,
  };
}

router.get('/packages', async (_req, res) => {
  try {
    const pool = await getDbPool();
    const [rows] = await pool.query('SELECT * FROM map_packages ORDER BY updatedAt DESC');
    res.json({ packages: rows.map(mapPackageRow) });
  } catch (error) {
    console.error('list packages failed', error);
    res.status(500).json({ message: 'paket listesi alınamadı' });
  }
});

router.post('/packages', async (req, res) => {
  try {
    const { region, version, manifestUrl = '', sizeBytes = null, checksum = '', status = 'ready' } = req.body || {};
    if (!region || !version) {
      return res.status(400).json({ message: 'region ve version zorunludur' });
    }
    const timestamp = now();
    const id = uuid();
    const pool = await getDbPool();
    await pool.execute(
      'INSERT INTO map_packages (id, region, version, manifestUrl, sizeBytes, checksum, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, region, version, manifestUrl, sizeBytes, checksum, status, timestamp, timestamp],
    );
    res.status(201).json({ package: { id, region, version, manifestUrl, sizeBytes, checksum, status, createdAt: timestamp, updatedAt: timestamp } });
  } catch (error) {
    console.error('create package failed', error);
    res.status(500).json({ message: 'paket kaydedilemedi' });
  }
});

router.get('/packages/:packageId', async (req, res) => {
  try {
    const { packageId } = req.params;
    const pool = await getDbPool();
    const [rows] = await pool.query('SELECT * FROM map_packages WHERE id = ?', [packageId]);
    if (!rows[0]) return res.status(404).json({ message: 'paket bulunamadı' });
    res.json({ package: mapPackageRow(rows[0]) });
  } catch (error) {
    console.error('get package failed', error);
    res.status(500).json({ message: 'paket getirilemedi' });
  }
});

router.put('/packages/:packageId', async (req, res) => {
  try {
    const { packageId } = req.params;
    const { region, version, manifestUrl, sizeBytes, checksum, status } = req.body || {};
    const pool = await getDbPool();
    const [existingRows] = await pool.query('SELECT * FROM map_packages WHERE id = ?', [packageId]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ message: 'paket bulunamadı' });

    const nextValues = {
      region: region || existing.region,
      version: version || existing.version,
      manifestUrl: manifestUrl ?? existing.manifestUrl,
      sizeBytes: sizeBytes ?? existing.sizeBytes,
      checksum: checksum ?? existing.checksum,
      status: status || existing.status,
    };
    const timestamp = now();
    await pool.execute(
      'UPDATE map_packages SET region = ?, version = ?, manifestUrl = ?, sizeBytes = ?, checksum = ?, status = ?, updatedAt = ? WHERE id = ?',
      [nextValues.region, nextValues.version, nextValues.manifestUrl, nextValues.sizeBytes, nextValues.checksum, nextValues.status, timestamp, packageId],
    );
    res.json({ package: { ...mapPackageRow(existing), ...nextValues, updatedAt: timestamp } });
  } catch (error) {
    console.error('update package failed', error);
    res.status(500).json({ message: 'paket güncellenemedi' });
  }
});

router.post('/packages/:packageId/queue', async (req, res) => {
  try {
    const { packageId } = req.params;
    const { direction = 'download', status = 'pending' } = req.body || {};
    const pool = await getDbPool();
    const [existingRows] = await pool.query('SELECT id FROM map_packages WHERE id = ?', [packageId]);
    if (!existingRows[0]) return res.status(404).json({ message: 'paket bulunamadı' });

    const id = uuid();
    const timestamp = now();
    await pool.execute(
      'INSERT INTO sync_queue (id, packageId, direction, status, retryCount, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, packageId, direction, status, 0, timestamp, timestamp],
    );
    res.status(201).json({ item: { id, packageId, direction, status, retryCount: 0, createdAt: timestamp, updatedAt: timestamp } });
  } catch (error) {
    console.error('enqueue failed', error);
    res.status(500).json({ message: 'senkronizasyon kuyruğa eklenemedi' });
  }
});

router.get('/queue', async (_req, res) => {
  try {
    const pool = await getDbPool();
    const [rows] = await pool.query(
      'SELECT q.*, p.region, p.version FROM sync_queue q LEFT JOIN map_packages p ON p.id = q.packageId ORDER BY q.updatedAt DESC',
    );
    res.json({ queue: rows });
  } catch (error) {
    console.error('queue fetch failed', error);
    res.status(500).json({ message: 'kuyruk alınamadı' });
  }
});

router.put('/queue/:queueId', async (req, res) => {
  try {
    const { queueId } = req.params;
    const { status, retryCount, lastError } = req.body || {};
    const pool = await getDbPool();
    const [existingRows] = await pool.query('SELECT * FROM sync_queue WHERE id = ?', [queueId]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ message: 'kuyruk kaydı bulunamadı' });

    const nextValues = {
      status: status || existing.status,
      retryCount: retryCount ?? existing.retryCount,
      lastError: lastError ?? existing.lastError,
    };
    const timestamp = now();
    await pool.execute(
      'UPDATE sync_queue SET status = ?, retryCount = ?, lastError = ?, updatedAt = ? WHERE id = ?',
      [nextValues.status, nextValues.retryCount, nextValues.lastError, timestamp, queueId],
    );
    res.json({ item: { ...existing, ...nextValues, updatedAt: timestamp } });
  } catch (error) {
    console.error('queue update failed', error);
    res.status(500).json({ message: 'kuyruk kaydı güncellenemedi' });
  }
});

router.get('/tiles', async (req, res) => {
  try {
    const { region } = req.query;
    const pool = await getDbPool();
    const [rows] = await pool.query(
      region
        ? 'SELECT * FROM region_tiles WHERE region = ? ORDER BY zoom, tileX, tileY'
        : 'SELECT * FROM region_tiles ORDER BY region, zoom, tileX, tileY',
      region ? [region] : [],
    );
    res.json({ tiles: rows.map(mapTileRow) });
  } catch (error) {
    console.error('tile list failed', error);
    res.status(500).json({ message: 'tile index alınamadı' });
  }
});

router.post('/tiles', async (req, res) => {
  try {
    const { region, zoom, tileX, tileY, packageId = null } = req.body || {};
    if (!region || zoom === undefined || tileX === undefined || tileY === undefined) {
      return res.status(400).json({ message: 'region, zoom, tileX ve tileY zorunludur' });
    }

    const pool = await getDbPool();
    if (packageId) {
      const [packages] = await pool.query('SELECT id FROM map_packages WHERE id = ?', [packageId]);
      if (!packages[0]) {
        return res.status(400).json({ message: 'packageId geçersiz' });
      }
    }

    const id = uuid();
    const timestamp = now();
    try {
      await pool.execute(
        'INSERT INTO region_tiles (id, region, zoom, tileX, tileY, packageId, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, region, zoom, tileX, tileY, packageId, timestamp],
      );
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'bu tile zaten kayıtlı' });
      }
      throw error;
    }

    res.status(201).json({ tile: { id, region, zoom, tileX, tileY, packageId, updatedAt: timestamp } });
  } catch (error) {
    console.error('tile create failed', error);
    res.status(500).json({ message: 'tile kaydedilemedi' });
  }
});

router.put('/tiles/:tileId', async (req, res) => {
  try {
    const { tileId } = req.params;
    const { region, zoom, tileX, tileY, packageId } = req.body || {};
    const pool = await getDbPool();
    const [existingRows] = await pool.query('SELECT * FROM region_tiles WHERE id = ?', [tileId]);
    const existing = existingRows[0];
    if (!existing) {
      return res.status(404).json({ message: 'tile bulunamadı' });
    }

    if (packageId) {
      const [packages] = await pool.query('SELECT id FROM map_packages WHERE id = ?', [packageId]);
      if (!packages[0]) {
        return res.status(400).json({ message: 'packageId geçersiz' });
      }
    }

    const nextValues = {
      region: region || existing.region,
      zoom: zoom ?? existing.zoom,
      tileX: tileX ?? existing.tileX,
      tileY: tileY ?? existing.tileY,
      packageId: packageId === undefined ? existing.packageId : packageId,
    };
    const timestamp = now();

    try {
      await pool.execute(
        'UPDATE region_tiles SET region = ?, zoom = ?, tileX = ?, tileY = ?, packageId = ?, updatedAt = ? WHERE id = ?',
        [
          nextValues.region,
          nextValues.zoom,
          nextValues.tileX,
          nextValues.tileY,
          nextValues.packageId,
          timestamp,
          tileId,
        ],
      );
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'bu tile zaten kayıtlı' });
      }
      throw error;
    }

    res.json({ tile: { ...mapTileRow(existing), ...nextValues, updatedAt: timestamp } });
  } catch (error) {
    console.error('tile update failed', error);
    res.status(500).json({ message: 'tile güncellenemedi' });
  }
});

router.delete('/tiles/:tileId', async (req, res) => {
  try {
    const { tileId } = req.params;
    const pool = await getDbPool();
    const [result] = await pool.execute('DELETE FROM region_tiles WHERE id = ?', [tileId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'tile bulunamadı' });
    }
    res.status(204).send();
  } catch (error) {
    console.error('tile delete failed', error);
    res.status(500).json({ message: 'tile silinemedi' });
  }
});

export default router;
