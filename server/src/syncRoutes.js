import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getDbPool } from './db.js';
import { z } from 'zod';

const router = Router();

const packageStatusSchema = z.enum(['ready', 'pending', 'processing', 'failed']);
const queueDirectionSchema = z.enum(['upload', 'download']);
const queueStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);

const packageCreateSchema = z
  .object({
    region: z.string().trim().min(1),
    version: z.string().trim().min(1),
    manifestUrl: z.string().trim().url().optional(),
    sizeBytes: z.coerce.number().int().nonnegative().optional(),
    checksum: z.string().trim().optional(),
    status: packageStatusSchema.default('ready'),
  })
  .strict();

const packageUpdateSchema = z
  .object({
    region: z.string().trim().min(1).optional(),
    version: z.string().trim().min(1).optional(),
    manifestUrl: z.string().trim().url().optional(),
    sizeBytes: z.coerce.number().int().nonnegative().optional(),
    checksum: z.string().trim().optional(),
    status: packageStatusSchema.optional(),
  })
  .strict();

const queueCreateSchema = z
  .object({
    direction: queueDirectionSchema.default('download'),
    status: queueStatusSchema.default('pending'),
  })
  .strict();

const queueUpdateSchema = z
  .object({
    status: queueStatusSchema.optional(),
    retryCount: z.coerce.number().int().nonnegative().optional(),
    lastError: z.string().optional(),
  })
  .strict();

const zoomSchema = z.coerce.number().int().min(0).max(24);
const tileIndexSchema = z.coerce.number().int().min(0).max(16_777_215);

const tileCreateSchema = z
  .object({
    region: z.string().trim().min(1),
    zoom: zoomSchema,
    tileX: tileIndexSchema,
    tileY: tileIndexSchema,
    packageId: z.string().trim().min(1).optional(),
  })
  .strict();

const tileUpdateSchema = z
  .object({
    region: z.string().trim().min(1).optional(),
    zoom: zoomSchema.optional(),
    tileX: tileIndexSchema.optional(),
    tileY: tileIndexSchema.optional(),
    packageId: z.string().trim().min(1).optional(),
  })
  .strict();

function parseBody(schema, body, res) {
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    res.status(400).json({ message: 'geçersiz istek gövdesi', errors: parsed.error.issues });
    return null;
  }
  return parsed.data;
}

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
    const parsed = parseBody(packageCreateSchema, req.body, res);
    if (!parsed) return;
    const timestamp = now();
    const id = uuid();
    const pool = await getDbPool();
    await pool.execute(
      'INSERT INTO map_packages (id, region, version, manifestUrl, sizeBytes, checksum, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        parsed.region,
        parsed.version,
        parsed.manifestUrl ?? null,
        parsed.sizeBytes ?? null,
        parsed.checksum ?? '',
        parsed.status,
        timestamp,
        timestamp,
      ],
    );
    res.status(201).json({
      package: {
        id,
        region: parsed.region,
        version: parsed.version,
        manifestUrl: parsed.manifestUrl ?? null,
        sizeBytes: parsed.sizeBytes ?? null,
        checksum: parsed.checksum ?? '',
        status: parsed.status,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
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
    const parsed = parseBody(packageUpdateSchema, req.body, res);
    if (!parsed) return;
    const pool = await getDbPool();
    const [existingRows] = await pool.query('SELECT * FROM map_packages WHERE id = ?', [packageId]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ message: 'paket bulunamadı' });

    const nextValues = {
      region: parsed.region || existing.region,
      version: parsed.version || existing.version,
      manifestUrl: parsed.manifestUrl ?? existing.manifestUrl,
      sizeBytes: parsed.sizeBytes ?? existing.sizeBytes,
      checksum: parsed.checksum ?? existing.checksum,
      status: parsed.status || existing.status,
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
    const parsed = parseBody(queueCreateSchema, req.body, res);
    if (!parsed) return;
    const pool = await getDbPool();
    const [existingRows] = await pool.query('SELECT id FROM map_packages WHERE id = ?', [packageId]);
    if (!existingRows[0]) return res.status(404).json({ message: 'paket bulunamadı' });

    const id = uuid();
    const timestamp = now();
    await pool.execute(
      'INSERT INTO sync_queue (id, packageId, direction, status, retryCount, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, packageId, parsed.direction, parsed.status, 0, timestamp, timestamp],
    );
    res.status(201).json({
      item: {
        id,
        packageId,
        direction: parsed.direction,
        status: parsed.status,
        retryCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
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
    const parsed = parseBody(queueUpdateSchema, req.body, res);
    if (!parsed) return;
    const pool = await getDbPool();
    const [existingRows] = await pool.query('SELECT * FROM sync_queue WHERE id = ?', [queueId]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ message: 'kuyruk kaydı bulunamadı' });

    const nextValues = {
      status: parsed.status || existing.status,
      retryCount: parsed.retryCount ?? existing.retryCount,
      lastError: parsed.lastError ?? existing.lastError,
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
    const parsed = parseBody(tileCreateSchema, req.body, res);
    if (!parsed) return;

    const pool = await getDbPool();
    if (parsed.packageId) {
      const [packages] = await pool.query('SELECT id FROM map_packages WHERE id = ?', [parsed.packageId]);
      if (!packages[0]) {
        return res.status(400).json({ message: 'packageId geçersiz' });
      }
    }

    const id = uuid();
    const timestamp = now();
    try {
      await pool.execute(
        'INSERT INTO region_tiles (id, region, zoom, tileX, tileY, packageId, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, parsed.region, parsed.zoom, parsed.tileX, parsed.tileY, parsed.packageId ?? null, timestamp],
      );
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'bu tile zaten kayıtlı' });
      }
      throw error;
    }

    res.status(201).json({
      tile: {
        id,
        region: parsed.region,
        zoom: parsed.zoom,
        tileX: parsed.tileX,
        tileY: parsed.tileY,
        packageId: parsed.packageId ?? null,
        updatedAt: timestamp,
      },
    });
  } catch (error) {
    console.error('tile create failed', error);
    res.status(500).json({ message: 'tile kaydedilemedi' });
  }
});

router.put('/tiles/:tileId', async (req, res) => {
  try {
    const { tileId } = req.params;
    const parsed = parseBody(tileUpdateSchema, req.body, res);
    if (!parsed) return;
    const pool = await getDbPool();
    const [existingRows] = await pool.query('SELECT * FROM region_tiles WHERE id = ?', [tileId]);
    const existing = existingRows[0];
    if (!existing) {
      return res.status(404).json({ message: 'tile bulunamadı' });
    }

    if (parsed.packageId) {
      const [packages] = await pool.query('SELECT id FROM map_packages WHERE id = ?', [parsed.packageId]);
      if (!packages[0]) {
        return res.status(400).json({ message: 'packageId geçersiz' });
      }
    }

    const nextValues = {
      region: parsed.region || existing.region,
      zoom: parsed.zoom ?? existing.zoom,
      tileX: parsed.tileX ?? existing.tileX,
      tileY: parsed.tileY ?? existing.tileY,
      packageId: parsed.packageId === undefined ? existing.packageId : parsed.packageId,
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
