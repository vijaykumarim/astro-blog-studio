import { mkdirSync, readdirSync, copyFileSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../',import.meta.url)),
  destination = path.join(
    root,
    'storage',
    'exports',
    new Date().toISOString().replace(/[:.]/g, '-'),
  );
const exclude = new Set([
  'node_modules',
  'dist',
  '.astro',
  'storage',
  'test-results',
  'playwright-report',
  '.git',
]);
let count = 0;
function copy(relative) {
  const from = path.join(root, relative),
    to = path.join(destination, relative);
  if (lstatSync(from).isSymbolicLink())
    throw new Error('Source export does not follow symbolic links.');
  if (lstatSync(from).isDirectory()) {
    mkdirSync(to, { recursive: true });
    for (const name of readdirSync(from))
      if (!exclude.has(name) && (!name.startsWith('.env') || name === '.env.example'))
        copy(path.join(relative, name));
  } else {
    if (/\.(sqlite|db|log|png|webp|jpg|zip)$/i.test(relative) && !/^docs[\\/]screenshots[\\/](posts|editor|categories|mobile-settings)\.png$/.test(relative))
      throw new Error('Unexpected non-source file: ' + relative);
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
    count++;
  }
}
mkdirSync(destination, { recursive: true });
for (const name of [
  'src',
  'scripts',
  'tests',
  'example-site',
  'package.json',
  'package-lock.json',
  'astro.config.mjs',
  'studio.config.mjs',
  'tsconfig.json',
  'playwright.config.ts',
  '.gitignore',
  '.prettierrc.json',
  '.prettierignore',
  '.env.example',
  'README.md',
  'LICENSE',
  'SECURITY.md',
  'THIRD_PARTY.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  '.github',
  'docs',
])
  copy(name);
console.log(
  `Exported ${count} source files to ${destination}. Private storage, credentials and generated assets are excluded. Review before publishing.`,
);
