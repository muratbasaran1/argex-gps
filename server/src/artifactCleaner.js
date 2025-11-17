import { promises as fs } from 'fs';
import path from 'path';

const DERIVED_ROOT = path.resolve('data/derived');

export async function cleanDerivedArtifacts(settingKey) {
  const settingPath = path.join(DERIVED_ROOT, settingKey);
  try {
    const stat = await fs.stat(settingPath);
    if (stat.isDirectory()) {
      await fs.rm(settingPath, { recursive: true, force: true });
      return { deleted: true, path: settingPath };
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { deleted: false, path: settingPath };
}
