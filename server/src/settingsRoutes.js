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

function respondValidation(res, error) {
  return res.status(400).json({
    message: 'invalid payload',
    errors: error.flatten ? error.flatten() : error,
  });
}

router.get('/', async (req, res, next) => {
  try {
    const settings = await listSettings();
    res.json({ settings });
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

    const { key, value, description } = parsed.data;
    const setting = await createSetting({ key, value, description });
    res.status(201).json({ setting });
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
    res.json({ setting: updated });
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
    res.json({ removed, cleanup });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const item = await getSetting(req.params.id);
    if (!item) return res.status(404).json({ message: 'setting not found' });
    res.json({ setting: item });
  } catch (error) {
    next(error);
  }
});

export default router;
