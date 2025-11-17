import { promises as fs } from 'fs';
import path from 'path';

const DEFAULT_CLEAN_PATHS = [path.join('data', 'derived', '{key}')];

function buildTemplatesFromEnv() {
  const raw = process.env.CLEAN_PATHS;
  if (!raw) return DEFAULT_CLEAN_PATHS;
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const CLEAN_PATH_TEMPLATES = buildTemplatesFromEnv();

function resolvePath(template, key) {
  if (!template) return null;
  const trimmed = template.trim();
  if (!trimmed) return null;
  if (trimmed.includes('{key}')) {
    return path.resolve(trimmed.replaceAll('{key}', key));
  }
  return path.resolve(trimmed, key);
}

async function removePath(targetPath) {
  const stat = await fs.stat(targetPath);
  const type = stat.isDirectory() ? 'directory' : 'file';
  await fs.rm(targetPath, { recursive: stat.isDirectory(), force: true });
  return type;
}

export async function cleanDerivedArtifacts(settingKey, auditLogger = console) {
  const results = [];

  for (const template of CLEAN_PATH_TEMPLATES) {
    const targetPath = resolvePath(template, settingKey);
    if (!targetPath) continue;

    try {
      const type = await removePath(targetPath);
      auditLogger.info?.(
        `[cleanDerivedArtifacts] removed ${type} ${targetPath} for key ${settingKey}`
      );
      results.push({ path: targetPath, deleted: true, type });
    } catch (error) {
      if (error.code === 'ENOENT') {
        results.push({ path: targetPath, deleted: false, reason: 'not found' });
        continue;
      }
      auditLogger.error?.(
        `[cleanDerivedArtifacts] failed to remove ${targetPath} for key ${settingKey}: ${error.message}`
      );
      results.push({
        path: targetPath,
        deleted: false,
        error: error.message,
        code: error.code,
      });
    }
  }

  const failures = results.filter((item) => item.error);

  return {
    key: settingKey,
    success: failures.length === 0,
    results,
    failures,
  };
}
