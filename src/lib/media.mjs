import { existsSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { db, transaction, audit } from './db.mjs';
import { dataDir, inside } from './config.mjs';
import { revision, splitDocument } from './content.mjs';

export function deleteMedia(id, actor) {
  let removedFile;
  const result = transaction(() => {
    if (db.prepare("SELECT id FROM jobs WHERE status IN ('queued','building')").get())
      throw Error('Wait for publishing to finish before deleting images.');
    const media = db.prepare('SELECT * FROM media WHERE id=?').get(id);
    if (!media) throw Error('Image not found. Refresh the media library.');
    const used = [];
    for (const post of db.prepare('SELECT id,title,version,published_version FROM posts').all()) {
      for (const version of new Set([post.version,post.published_version].filter(Boolean))) {
        const doc = splitDocument(revision(post.id,version));
        if (doc.data.image === media.filename || doc.body.includes('/media/' + media.filename)) {
          used.push(post.title); break;
        }
      }
    }
    if (used.length) throw Error(`This image is used by ${used.length} post(s), including “${used[0]}”. Remove or replace it in drafts and published versions before deleting it.`);
    const file = inside(path.join(dataDir,'media'),media.filename);
    const temporary = file + '.deleting';
    // Release metadata handles from older gallery renders on Windows.
    sharp.cache(false);
    if (existsSync(file)) renameSync(file,temporary);
    try {
      db.prepare('DELETE FROM media WHERE id=?').run(id);
      db.prepare("DELETE FROM state WHERE key LIKE 'import_image:%' AND value=?").run(media.filename);
      audit(actor,'image-deleted',id);
      removedFile = existsSync(temporary) ? temporary : null;
    } catch(error) {
      if (existsSync(temporary)) renameSync(temporary,file);
      throw error;
    }
    return {ok:true};
  });
  if (removedFile) unlinkSync(removedFile);
  return result;
}
