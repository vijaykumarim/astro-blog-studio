import { defineConfig } from 'astro/config';
import { cpSync, mkdirSync } from 'node:fs';

import path from 'node:path';
export default defineConfig({
  site: process.env.STUDIO_SITE_URL || 'http://127.0.0.1:4331',
  output: 'static',
  ...(process.env.STUDIO_BUILD_DIR
    ? {
        outDir: path
          .relative(process.cwd(), process.env.STUDIO_BUILD_DIR)
          .replaceAll(path.sep, '/'),
      }
    : {}),
  ...(process.env.STUDIO_CACHE_DIR
    ? {
        cacheDir: path
          .relative(process.cwd(), process.env.STUDIO_CACHE_DIR)
          .replaceAll(path.sep, '/'),
      }
    : {}),
  integrations: [
    {
      name: 'studio-media',
      hooks: {
        'astro:build:done': ({ dir }) => {
          if (process.env.STUDIO_MEDIA_DIR) {
            const target = new URL('./media/', dir);
            mkdirSync(target, { recursive: true });
            cpSync(process.env.STUDIO_MEDIA_DIR, target, { recursive: true });
          }
        },
      },
    },
  ],
});
