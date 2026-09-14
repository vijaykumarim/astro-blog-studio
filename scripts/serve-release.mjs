import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { releaseFile } from '../src/lib/publish.mjs';
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};
createServer((request, response) => {
  try {
    const file = releaseFile(new URL(request.url, 'http://localhost').pathname);
    if (!file) {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('No published page yet. Publish your first article from Blog Studio.');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex,nofollow',
    });
    response.end(readFileSync(file));
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}).listen(4331, '127.0.0.1', () =>
  console.log('Local published website: http://127.0.0.1:4331/blog/'),
);
