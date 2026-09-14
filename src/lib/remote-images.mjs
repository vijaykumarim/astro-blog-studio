import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { db } from './db.mjs';
import { dataDir } from './config.mjs';
import { convertImage, imageSettings } from './image-settings.mjs';

// Use public IPv4 destinations only, and pin the checked address to the socket.
export function publicAddress(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a,b] = parts;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0));
}
export async function downloadImage(source, maxBytes, signal, redirects = 0) {
  const url = new URL(source);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
    (url.port && !['80','443'].includes(url.port))) throw Error('Use a public HTTP or HTTPS image URL.');
  const addresses = await lookup(url.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw Error('Image host is not a public address.');
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(url, {
      signal, agent: false,
      lookup: (_host, options, callback) => {
        const address = addresses[0].address;
        if (options.all) callback(null, [{address, family:4}]);
        else callback(null, address, 4);
      },
      headers: { Accept: 'image/*', 'User-Agent': 'Astro-Blog-Studio/1.0' },
    }, response => {
      if ([301,302,303,307,308].includes(response.statusCode)) {
        response.resume();
        if (redirects >= 3 || !response.headers.location) return reject(Error('Too many image redirects.'));
        downloadImage(new URL(response.headers.location, url).href, maxBytes, signal, redirects + 1).then(resolve,reject);
        return;
      }
      if (response.statusCode !== 200) { response.resume(); return reject(Error(`Image server returned ${response.statusCode}.`)); }
      if (!/^image\/(jpeg|png|webp|avif)(;|$)/i.test(response.headers['content-type'] || '')) {
        response.destroy(); return reject(Error('URL must return a still JPG, PNG, WebP or AVIF image.'));
      }
      let size = 0; const chunks = [];
      response.on('data', chunk => {
        size += chunk.length;
        if (size > maxBytes) { reject(Error('Image exceeds your upload size limit.')); response.destroy(); }
        else chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });
    request.on('error', reject);
  });
}
let busy = false;
export async function importRemoteImage(source) {
  if (typeof source !== 'string' || source.length > 4096) throw Error('Invalid image URL.');
  const url = new URL(source); url.hash = '';
  const key = 'import_image:' + createHash('sha256').update(url.href).digest('hex');
  const cached = db.prepare('SELECT value FROM state WHERE key=?').get(key)?.value;
  if (cached && /^[a-f0-9-]+\.(webp|avif|jpg|png)$/.test(cached) && existsSync(path.join(dataDir,'media',cached)))
    return { filename: cached, reused: true };
  if (busy) throw Error('Another image is being imported. Try again shortly.');
  busy = true;
  try {
    const settings = imageSettings();
    const buffer = await downloadImage(url.href, settings.maxUploadMB * 1024 * 1024, AbortSignal.timeout(20000));
    const result = await convertImage(buffer, settings);
    db.prepare('INSERT INTO state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,result.filename);
    return result;
  } catch (error) {
    if (['EACCES', 'EPERM'].includes(error.code)) throw Error('The dashboard server is blocked from downloading images. Check its network permissions. No image was saved.');
    throw error;
  } finally { busy = false; }
}
