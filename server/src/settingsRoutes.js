import { Router } from 'express';
import { cleanDerivedArtifacts } from './artifactCleaner.js';
import { createSetting, deleteSetting, getSetting, listSettings, updateSetting } from './settingsStore.js';

const router = Router();

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
    const { key, value, description } = req.body || {};
    if (!key || typeof value === 'undefined') {
      return res.status(400).json({ message: 'key and value are required' });
    }
    const setting = await createSetting({ key, value, description });
    res.status(201).json({ setting });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await updateSetting(id, req.body || {});
    if (!updated) {
      return res.status(404).json({ message: 'setting not found' });
    }
    res.json({ setting: updated });
  } catch (error) {
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
