import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env')) {
  console.log('.env already exists; left unchanged.');
} else {
  writeFileSync(
    '.env',
    `STUDIO_ORIGIN=http://127.0.0.1:4330\nSTUDIO_SECRET=${randomBytes(48).toString('base64url')}\nSTUDIO_DATA=./storage\nSTUDIO_VITE_CACHE=./node_modules/.vite-studio-dev\nHOST=127.0.0.1\nPORT=4330\n`,
    { mode: 0o600, flag: 'wx' },
  );
  console.log(
    'Private local configuration created. Next: npm run admin -- "Your name" "your@email.com"',
  );
}
