import { backup } from 'node:sqlite';
import { mkdirSync, cpSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { dataDir } from '../src/lib/config.mjs';
import { db } from '../src/lib/db.mjs';
const destination = path.join(dataDir, 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(destination, { recursive: true, mode: 0o700 });
await backup(db, path.join(destination, 'studio.sqlite'));
// Draft revisions and image filenames are immutable; copying after the DB snapshot preserves referenced files.
for (const name of ['drafts', 'media'])
  cpSync(path.join(dataDir, name), path.join(destination, name), { recursive: true });
writeFileSync(
  path.join(destination, 'README.txt'),
  'Private backup: SQLite, draft revisions and media. Restore while the dashboard is stopped. Also restore the original STUDIO_SECRET from your separate secret backup. Rebuild published content after restore; releases and logs are not included. Keep this folder off the public web.',
);
console.log('Private backup created: ' + destination);
