import { Router } from 'express';
import { cleanDerivedArtifacts } from './artifactCleaner.js';
import {
  SettingConflictError,
  createSettingsStore,
  createSetting as defaultCreateSetting,
  deleteSetting as defaultDeleteSetting,
  getSetting as defaultGetSetting,
  listSettings as defaultListSettings,
  updateSetting as defaultUpdateSetting,
} from './settingsStore.js';
import { createSettingSchema, updateSettingSchema } from './settingsSchema.js';

const defaultStore = createSettingsStore();

const CLIENT_ALLOWED_PREFIXES = ['public.', 'public_', 'url.', 'url_', 'cdn.', 'cdn_'];

const DEFAULT_SETTING_KEY_MAP = new Map([
  ['settings_default_region', 'public.settings.defaultRegion'],
  ['settings_default_map_style', 'public.settings.defaultMapStyle'],
  ['settings_feature_flags', 'public.settings.featureFlags'],
]);

const ENDPOINT_SETTING_KEY_MAP = new Map([
  ['api_base_url', 'public.api.baseUrl'],
  ['api_websocket_url', 'public.api.websocketUrl'],
  ['tile_cdn_url', 'public.cdn.tileUrl'],
]);

const MAP_PACKAGE_SETTING_KEY_MAP = new Map([
  ['map_package_base_url', 'public.maps.baseUrl'],
  ['map_package_index_url', 'public.maps.indexUrl'],
  ['map_package_download_url', 'public.maps.downloadUrl'],
  ['map_package_manifest_url', 'public.maps.manifestUrl'],
]);

const CLIENT_ALLOWED_KEYS = new Map([
  ...DEFAULT_SETTING_KEY_MAP,
  ...ENDPOINT_SETTING_KEY_MAP,
  ...MAP_PACKAGE_SETTING_KEY_MAP,
]);

function respondValidation(res, error) {
  return res.status(400).json({
    message: 'invalid payload',
    errors: error.flatten ? error.flatten() : error,
  });
}

function maskSetting(setting) {
  if (!setting) return null;
  const result = { ...setting, secret: Boolean(setting.secret) };
  if (result.secret) {
    result.value = '***';
    result.masked = true;
  } else {
    result.masked = false;
  }
  return result;
}

function isClientVisible(setting) {
  if (!setting || setting.secret) return false;
  const lowerKey = String(setting.key || '').toLowerCase();
  return CLIENT_ALLOWED_KEYS.has(lowerKey) || CLIENT_ALLOWED_PREFIXES.some((prefix) => lowerKey.startsWith(prefix));
}

function normalizeClientSetting(setting) {
  if (!setting) return null;
  const lowerKey = String(setting.key || '').toLowerCase();
  const mappedKey = CLIENT_ALLOWED_KEYS.get(lowerKey);
  if (!mappedKey) return setting;
  return { ...setting, key: mappedKey };
}

function buildStore(store) {
  if (store) return store;
  return {
    listSettings: defaultListSettings,
    getSetting: defaultGetSetting,
    createSetting: defaultCreateSetting,
    updateSetting: defaultUpdateSetting,
    deleteSetting: defaultDeleteSetting,
  };
}

export function createSettingsRouter(store, options = {}) {
  const resolvedStore = buildStore(store);
  const { cleaner = cleanDerivedArtifacts } = options;
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const settings = await resolvedStore.listSettings();
      res.json({ settings: settings.map((item) => maskSetting(item)) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const parsed = createSettingSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return respondValidation(res, parsed.error);
      }

      const { key, value, description, secret } = parsed.data;
      const setting = await resolvedStore.createSetting({ key, value, description, secret });
      res.status(201).json({ setting: maskSetting(setting) });
    } catch (error) {
      if (error instanceof SettingConflictError) {
        return res.status(409).json({ message: error.message });
      }
      next(error);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const parsed = updateSettingSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return respondValidation(res, parsed.error);
      }

      const { id } = req.params;
      const updated = await resolvedStore.updateSetting(id, parsed.data);
      if (!updated) {
        return res.status(404).json({ message: 'setting not found' });
      }
      res.json({ setting: maskSetting(updated) });
    } catch (error) {
      if (error instanceof SettingConflictError) {
        return res.status(409).json({ message: error.message });
      }
      next(error);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      const removed = await resolvedStore.deleteSetting(id);
      if (!removed) {
        return res.status(404).json({ message: 'setting not found' });
      }
      const cleanup = await cleaner(removed.key);
      const hasCleanupErrors = Boolean(cleanup.failures.length);

      if (hasCleanupErrors) {
        return res.status(500).json({
          removed: maskSetting(removed),
          cleanup,
          message: 'setting deleted but some derived artifacts could not be cleaned',
        });
      }

      res.json({ removed: maskSetting(removed), cleanup });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const item = await resolvedStore.getSetting(req.params.id);
      if (!item) return res.status(404).json({ message: 'setting not found' });
      res.json({ setting: maskSetting(item) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function createPublicSettingsRouter(store) {
  const resolvedStore = buildStore(store);
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const settings = await resolvedStore.listSettings();
      const visibleSettings = settings
        .filter(isClientVisible)
        .map((setting) => normalizeClientSetting(setting))
        .map((setting) => ({
          key: setting.key,
          value: setting.value,
          updatedAt: setting.updatedAt,
        }));
      res.json({ settings: visibleSettings });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

const settingsRouter = createSettingsRouter(defaultStore);
const publicSettingsRouter = createPublicSettingsRouter(defaultStore);

export { publicSettingsRouter };
export default settingsRouter;
