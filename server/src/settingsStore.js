import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';

const SETTINGS_PATH = path.resolve('data/settings.json');

async function ensureStore() {
  try {
    await fs.access(SETTINGS_PATH);
  } catch (err) {
    await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
    await fs.writeFile(SETTINGS_PATH, JSON.stringify({ settings: [] }, null, 2));
  }
}

export async function listSettings() {
  await ensureStore();
  const raw = await fs.readFile(SETTINGS_PATH, 'utf8');
  const data = JSON.parse(raw || '{"settings": []}');
  return data.settings || [];
}

export async function getSetting(id) {
  const settings = await listSettings();
  return settings.find((entry) => entry.id === id) || null;
}

export async function createSetting(payload) {
  const settings = await listSettings();
  const setting = {
    id: uuid(),
    key: payload.key,
    value: payload.value,
    description: payload.description || '',
    updatedAt: new Date().toISOString(),
  };
  settings.push(setting);
  await persist(settings);
  return setting;
}

export async function updateSetting(id, payload) {
  const settings = await listSettings();
  const idx = settings.findIndex((entry) => entry.id === id);
  if (idx === -1) return null;
  settings[idx] = {
    ...settings[idx],
    key: payload.key ?? settings[idx].key,
    value: payload.value ?? settings[idx].value,
    description: payload.description ?? settings[idx].description,
    updatedAt: new Date().toISOString(),
  };
  await persist(settings);
  return settings[idx];
}

export async function deleteSetting(id) {
  const settings = await listSettings();
  const idx = settings.findIndex((entry) => entry.id === id);
  if (idx === -1) return null;
  const [removed] = settings.splice(idx, 1);
  await persist(settings);
  return removed;
}

async function persist(settings) {
  const payload = JSON.stringify({ settings }, null, 2);
  await fs.writeFile(SETTINGS_PATH, payload);
}
