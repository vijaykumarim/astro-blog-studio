import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import defaultConfig from '../../studio.config.mjs';
export const root = process.cwd();
export const dataDir = path.resolve(root, process.env.STUDIO_DATA || 'storage');
export const origin = process.env.STUDIO_ORIGIN || 'http://127.0.0.1:4330';
export const secret = process.env.STUDIO_SECRET;
if (!secret || secret.length < 32)
  throw new Error('Run npm run setup first: STUDIO_SECRET must have at least 32 characters.');
export const studio = process.env.STUDIO_CONFIG
  ? (await import(/* @vite-ignore */ pathToFileURL(path.resolve(process.env.STUDIO_CONFIG)).href))
      .default
  : defaultConfig;
for (const folder of ['', 'drafts', 'media', 'releases', 'snapshots', 'logs'])
  mkdirSync(path.join(dataDir, folder), { recursive: true, mode: 0o700 });
export const inside = (base, relative) => {
  const target = path.resolve(base, relative);
  if (target === path.resolve(base) || !target.startsWith(path.resolve(base) + path.sep))
    throw new Error('Invalid storage path');
  return target;
};
