import type { APIRoute } from 'astro';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { dataDir } from '../../lib/config.mjs';
export const GET: APIRoute = ({ params }) => {
  const name = params.file ?? '';
  if (!/^[a-f0-9-]{36}\.(?:webp|avif|jpg|png)$/.test(name))
    return new Response('Not found', { status: 404 });
  const file = path.join(dataDir, 'media', name);
  if (!existsSync(file)) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(readFileSync(file)), {
    headers: {
      'Content-Type': 'image/' + (name.endsWith('.jpg') ? 'jpeg' : name.split('.').at(-1)),
    },
  });
};
