import { v4 as uuid } from 'uuid';
import { getDbPool } from './db.js';

export class SettingConflictError extends Error {
  constructor(key) {
    super(`setting with key "${key}" already exists`);
    this.name = 'SettingConflictError';
  }
}

function sanitizeStored(setting) {
  if (!setting) return null;
  const trimmedDescription =
    typeof setting.description === 'string' ? setting.description.trim() : setting.description || '';
  const trimmedKey = typeof setting.key === 'string' ? setting.key.trim() : setting.key;
  const trimmedValue = typeof setting.value === 'string' ? setting.value.trim() : setting.value;
  const updatedAt =
    setting.updatedAt instanceof Date ? setting.updatedAt.toISOString() : String(setting.updatedAt);

  return {
    ...setting,
    key: trimmedKey,
    value: trimmedValue,
    description: trimmedDescription,
    secret: Boolean(setting.secret),
    updatedAt,
  };
}

export function createSettingsStore(poolProvider = getDbPool) {
  async function listSettings() {
    const pool = await poolProvider();
    const [rows] = await pool.execute(
      'SELECT id, `key`, value, description, secret, updatedAt FROM settings ORDER BY `key`'
    );
    return rows.map(sanitizeStored);
  }

  async function getSetting(id) {
    const pool = await poolProvider();
    const [rows] = await pool.execute(
      'SELECT id, `key`, value, description, secret, updatedAt FROM settings WHERE id = ?',
      [id]
    );
    return sanitizeStored(rows[0]);
  }

  async function createSetting(payload) {
    const setting = {
      id: uuid(),
      key: payload.key,
      value: payload.value,
      description: payload.description ?? '',
      secret: Boolean(payload.secret),
      updatedAt: new Date().toISOString(),
    };

    const normalized = sanitizeStored(setting);

    const pool = await poolProvider();
    try {
      await pool.execute(
        'INSERT INTO settings (id, `key`, value, description, secret, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        [
          normalized.id,
          normalized.key,
          normalized.value,
          normalized.description,
          normalized.secret ? 1 : 0,
          normalized.updatedAt,
        ]
      );
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        throw new SettingConflictError(payload.key);
      }
      throw error;
    }

    return normalized;
  }

  async function updateSetting(id, payload) {
    const existing = await getSetting(id);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...payload,
      description: payload.description ?? existing.description ?? '',
      secret: typeof payload.secret === 'undefined' ? existing.secret : Boolean(payload.secret),
      updatedAt: new Date().toISOString(),
    };

    const normalized = sanitizeStored(updated);

    const pool = await poolProvider();
    try {
      await pool.execute(
        'UPDATE settings SET `key` = ?, value = ?, description = ?, secret = ?, updatedAt = ? WHERE id = ?',
        [
          normalized.key,
          normalized.value,
          normalized.description,
          normalized.secret ? 1 : 0,
          normalized.updatedAt,
          id,
        ]
      );
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        throw new SettingConflictError(payload.key ?? existing.key);
      }
      throw error;
    }

    return normalized;
  }

  async function deleteSetting(id) {
    const existing = await getSetting(id);
    if (!existing) return null;
    const pool = await poolProvider();
    await pool.execute('DELETE FROM settings WHERE id = ?', [id]);
    return existing;
  }

  return { listSettings, getSetting, createSetting, updateSetting, deleteSetting };
}

const defaultStore = createSettingsStore();

export const listSettings = (...args) => defaultStore.listSettings(...args);
export const getSetting = (...args) => defaultStore.getSetting(...args);
export const createSetting = (...args) => defaultStore.createSetting(...args);
export const updateSetting = (...args) => defaultStore.updateSetting(...args);
export const deleteSetting = (...args) => defaultStore.deleteSetting(...args);
