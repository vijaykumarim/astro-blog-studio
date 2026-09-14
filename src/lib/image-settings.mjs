import { z } from 'zod';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { db, audit } from './db.mjs';
import { dataDir } from './config.mjs';
const schema = z.object({
  maxWidth: z.number().int().min(320).max(4000),
  maxHeight: z.number().int().min(320).max(4000),
  maxUploadMB: z.number().int().min(1).max(20),
  format: z.enum(['webp', 'avif', 'jpeg', 'png']),
  quality: z.number().int().min(30).max(100),
  ratio: z.enum(['original', '1:1', '4:3', '3:2', '16:9']),
  fit: z.enum(['cover', 'contain']),
});
export function imageSettings() {
  return schema.parse(
    JSON.parse(
      db.prepare("SELECT value FROM state WHERE key='image_settings'").get()?.value ||
        JSON.stringify({
          maxWidth: 2000,
          maxHeight: 2000,
          maxUploadMB: 8,
          format: 'webp',
          quality: 85,
          ratio: 'original',
          fit: 'cover',
        }),
    ),
  );
}
export function saveImageSettings(input, actor) {
  const value = schema.parse(input);
  db.prepare(
    "INSERT INTO state(key,value) VALUES('image_settings',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  ).run(JSON.stringify(value));
  audit(actor, 'image-settings-updated', 'images');
  return value;
}
export async function convertImage(buffer, settings = imageSettings()) {
  if (buffer.length > settings.maxUploadMB * 1024 * 1024)
    throw new Error(`Choose an image under ${settings.maxUploadMB} MB.`);
  let image = sharp(buffer, { limitInputPixels: 24000000 });
  const info = await image.metadata();
  if (
    !(
      ['jpeg', 'png', 'webp'].includes(info.format) ||
      (info.format === 'heif' && info.compression === 'av1')
    ) ||
    info.pages > 1
  )
    throw new Error('Use a still JPG, PNG, WebP or AVIF image.');
  image = image.rotate();
  let width = settings.maxWidth,
    height = settings.maxHeight;
  if (settings.ratio === 'original')
    image = image.resize(width, height, { fit: 'inside', withoutEnlargement: true });
  else {
    const [w, h] = settings.ratio.split(':').map(Number),
      ratio = w / h;
    width = Math.floor(Math.min(width, height * ratio));
    height = Math.round(width / ratio);
    image = image.resize(width, height, {
      fit: settings.fit,
      position: 'centre',
      background: '#ffffff',
    });
  }
  if (settings.format === 'jpeg') image = image.flatten({ background: '#ffffff' });
  image = image.toFormat(settings.format, {
    quality: settings.quality,
    ...(settings.format === 'png' ? { palette: true, compressionLevel: 9 } : {}),
  });
  const id = randomUUID(),
    filename = id + '.' + (settings.format === 'jpeg' ? 'jpg' : settings.format);
  await image.toFile(path.join(dataDir, 'media', filename));
  db.prepare('INSERT INTO media VALUES(?,?,?,?)').run(id, filename, '', new Date().toISOString());
  return { filename, url: '/media/' + filename };
}
