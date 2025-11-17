import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';

export class SettingConflictError extends Error {
  constructor(key) {
    super(`setting with key "${key}" already exists`);
    this.name = 'SettingConflictError';
  }
}

const DB_PATH = path.resolve('data/settings.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.prepare(
  `CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT DEFAULT '',
    updatedAt TEXT NOT NULL
  )`
).run();
db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_key ON settings(key);').run();

const selectAll = db.prepare('SELECT id, key, value, description, updatedAt FROM settings ORDER BY key');
const selectById = db.prepare('SELECT id, key, value, description, updatedAt FROM settings WHERE id = ?');
const insertSetting = db.prepare(
  'INSERT INTO settings (id, key, value, description, updatedAt) VALUES (?, ?, ?, ?, ?)' 
);
const updateSettingStmt = db.prepare(
  'UPDATE settings SET key = ?, value = ?, description = ?, updatedAt = ? WHERE id = ?'
);
const deleteSettingStmt = db.prepare('DELETE FROM settings WHERE id = ?');

function sanitizeStored(setting) {
  if (!setting) return null;
  return {
    ...setting,
    key: typeof setting.key === 'string' ? setting.key.trim() : setting.key,
    value: typeof setting.value === 'string' ? setting.value.trim() : setting.value,
    description:
      typeof setting.description === 'string' ? setting.description.trim() : setting.description || '',
  };
}

export async function listSettings() {
  const rows = selectAll.all();
  return rows.map(sanitizeStored);
}

export async function getSetting(id) {
  const row = selectById.get(id);
  return sanitizeStored(row);
}

export async function createSetting(payload) {
  const setting = {
    id: uuid(),
    key: payload.key,
    value: payload.value,
    description: payload.description ?? '',
    updatedAt: new Date().toISOString(),
  };

  try {
    insertSetting.run(setting.id, setting.key, setting.value, setting.description, setting.updatedAt);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new SettingConflictError(payload.key);
    }
    throw error;
  }

  return sanitizeStored(setting);
}

export async function updateSetting(id, payload) {
  const existing = await getSetting(id);
  if (!existing) return null;

  const updated = {
    ...existing,
    ...payload,
    description: payload.description ?? existing.description ?? '',
    updatedAt: new Date().toISOString(),
  };

  try {
    updateSettingStmt.run(
      updated.key,
      updated.value,
      updated.description,
      updated.updatedAt,
      id
    );
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new SettingConflictError(payload.key ?? existing.key);
    }
    throw error;
  }

  return sanitizeStored(updated);
}

export async function deleteSetting(id) {
  const existing = await getSetting(id);
  if (!existing) return null;
  deleteSettingStmt.run(id);
  return existing;
}
