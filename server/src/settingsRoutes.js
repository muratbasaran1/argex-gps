import { Router } from 'express';
import { cleanDerivedArtifacts } from './artifactCleaner.js';
import {
  SettingConflictError,
  createSetting,
  deleteSetting,
  getSetting,
  listSettings,
  updateSetting,
} from './settingsStore.js';
import { createSettingSchema, updateSettingSchema } from './settingsSchema.js';

const router = Router();
const publicSettingsRouter = Router();
const CLIENT_ALLOWED_PREFIXES = ['public.', 'public_', 'url.', 'url_', 'cdn.', 'cdn_'];

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
  return CLIENT_ALLOWED_PREFIXES.some((prefix) => lowerKey.startsWith(prefix));
}

router.get('/', async (req, res, next) => {
  try {
    const settings = await listSettings();
    res.json({ settings: settings.map((item) => maskSetting(item)) });
  } catch (error) {
    next(error);
  }
});

publicSettingsRouter.get('/', async (req, res, next) => {
  try {
    const settings = await listSettings();
    const visibleSettings = settings
      .filter(isClientVisible)
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

router.post('/', async (req, res, next) => {
  try {
    const parsed = createSettingSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return respondValidation(res, parsed.error);
    }

    const { key, value, description, secret } = parsed.data;
    const setting = await createSetting({ key, value, description, secret });
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
    const updated = await updateSetting(id, parsed.data);
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
    const removed = await deleteSetting(id);
    if (!removed) {
      return res.status(404).json({ message: 'setting not found' });
    }
    const cleanup = await cleanDerivedArtifacts(removed.key);
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
    const item = await getSetting(req.params.id);
    if (!item) return res.status(404).json({ message: 'setting not found' });
    res.json({ setting: maskSetting(item) });
  } catch (error) {
    next(error);
  }
});

export { publicSettingsRouter };
export default router;
