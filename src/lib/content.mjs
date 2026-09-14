import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import TurndownService from 'turndown';
import { db, audit, transaction, postCategories } from './db.mjs';
import { dataDir } from './config.mjs';
export class Conflict extends Error {}
const text = (max) => z.string().trim().max(max);
const schema = z.object({
  title: text(160).min(1),
  slug: text(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .refine((value) => value !== 'category', 'This URL is reserved for category pages.'),
  excerpt: text(320),
  category: text(60).optional(),
  categories: z.array(text(60).min(1)).min(1).max(10).optional(),
  author: text(100).min(1),
  image: z.string().regex(/^(?:|[a-f0-9-]{36}\.(?:webp|avif|jpg|png))$/),
  alt: text(240),
  seo_title: text(160),
  seo_description: text(320),
  html: z.string().max(250000),
  version: z.number().int().nonnegative(),
});
export function cleanHtml(html) {
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'h2',
      'h3',
      'h4',
      'strong',
      'em',
      's',
      'ul',
      'ol',
      'li',
      'blockquote',
      'a',
      'img',
      'hr',
      'code',
      'pre',
    ],
    allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt', 'title'] },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowProtocolRelative: false,
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }) },
    exclusiveFilter: (frame) =>
      frame.tag === 'img' &&
      !/^\/media\/[a-f0-9-]{36}\.(?:webp|avif|jpg|png)$/.test(frame.attribs.src || ''),
  });
}
const converter = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
export function htmlToMarkdown(html) {
  return converter.turndown(cleanHtml(html));
}
export const markdownToHtml = (markdown) => cleanHtml(marked.parse(markdown, { async: false }));
export function atomicWrite(file, content) {
  const tmp = file + '.' + randomUUID() + '.tmp';
  writeFileSync(tmp, content, { mode: 0o600, flag: 'wx' });
  renameSync(tmp, file);
}
export const draftPath = (id, version) => {
  if (!/^[a-f0-9-]{36}$/.test(id) || !Number.isSafeInteger(version) || version < 1)
    throw new Error('Invalid revision.');
  return path.join(dataDir, 'drafts', id + '.' + version + '.md');
};
export function revision(id, version) {
  return readFileSync(draftPath(id, version), 'utf8');
}
export function splitDocument(document) {
  const match = document.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('Invalid article file.');
  return { data: JSON.parse(match[1]), body: match[2] };
}
/** @returns {(import('./types').Post & {html:string}) | null} */
export function getPost(id) {
  const row = /** @type {import('./types').Post|undefined} */ (
    db.prepare('SELECT * FROM posts WHERE id=?').get(id)
  );
  if (!row) return null;
  return {
    ...row,
    categories: postCategories(row),
    html: markdownToHtml(splitDocument(revision(id, row.version)).body),
  };
}
export function savePost(id, input, actor, migration = {}) {
  const data = schema.parse(input);
  if (data.image && !existsSync(path.join(dataDir, 'media', data.image)))
    throw new Error('Upload a featured image first.');
  return transaction(() => {
    const names = [...new Set(data.categories ?? (data.category ? [data.category] : []))];
    const selected = names.map((name) =>
      db.prepare('SELECT name,slug FROM categories WHERE name=?').get(name),
    );
    if (!selected.length || selected.some((c) => !c))
      throw new Error(
        'This category has changed. Reload the editor and choose an available category.',
      );
    data.categories = selected.map((c) => c.name);
    data.category = data.categories[0];
    const old = id ? db.prepare('SELECT * FROM posts WHERE id=?').get(id) : null;
    if (id && !old) throw new Error('Post not found.');
    if (old && old.version !== data.version)
      throw new Conflict('Someone saved a newer version. Reload the post before saving.');
    if (old?.published_version && old.slug !== data.slug)
      throw new Error('Unpublish this article before changing its URL.');
    if (
      old &&
      old.slug !== data.slug &&
      db.prepare("SELECT id FROM jobs WHERE status IN ('queued','building')").get()
    )
      throw new Error('Wait for publishing to finish before changing the URL.');
    if (db.prepare('SELECT id FROM redirects WHERE source=?').get('/blog/' + data.slug + '/'))
      throw new Error(
        'This post URL is already a redirect source. Remove that redirect before using this slug.',
      );
    const duplicate = db.prepare('SELECT id FROM posts WHERE slug=?').get(data.slug);
    if (duplicate && duplicate.id !== id) throw new Error('Another article already uses this URL.');
    const body = htmlToMarkdown(data.html),
      version = (old?.version ?? 0) + 1,
      postId = id ?? randomUUID(),
      now = new Date().toISOString();
    const { html: _, version: __, ...metadata } = data;
    atomicWrite(
      draftPath(postId, version),
      `---\n${JSON.stringify({ ...metadata, categoryLinks: selected, id: postId, created_at: old?.created_at ?? migration.createdAt ?? now, updated_at: now }, null, 2)}\n---\n${body}\n`,
    );
    const fields = [
      data.slug,
      data.title,
      data.excerpt,
      data.category,
      data.author,
      data.image,
      data.alt,
      data.seo_title,
      data.seo_description,
      version,
      now,
    ];
    if (old)
      db.prepare(
        'UPDATE posts SET slug=?,title=?,excerpt=?,category=?,author=?,image=?,alt=?,seo_title=?,seo_description=?,version=?,updated_at=? WHERE id=?',
      ).run(...fields, postId);
    else
      db.prepare(
        'INSERT INTO posts(slug,title,excerpt,category,author,image,alt,seo_title,seo_description,version,updated_at,id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
      ).run(...fields, postId, migration.createdAt ?? now);
    if (migration.sourceUrl)
      db.prepare(
        'INSERT INTO imports(source_url,post_id,imported_at) VALUES(?,?,?) ON CONFLICT(source_url) DO UPDATE SET post_id=excluded.post_id,imported_at=excluded.imported_at',
      ).run(migration.sourceUrl, postId, now);
    audit(actor, 'draft-saved', postId);
    db.prepare('UPDATE posts SET categories_json=? WHERE id=?').run(
      JSON.stringify(data.categories),
      postId,
    );
    return getPost(postId);
  });
}
export function deletePosts(ids, actor) {
  return transaction(() => {
    if (!Array.isArray(ids) || !ids.length)
      throw new Error('Select at least one post.');
    if (db.prepare("SELECT id FROM jobs WHERE status IN ('queued','building')").get())
      throw new Error('Wait for publishing to finish.');
    for (const id of ids) {
      const row = db.prepare('SELECT published_version FROM posts WHERE id=?').get(id);
      if (!row) throw new Error('Post not found.');
      if (row.published_version) throw new Error('Unpublish every selected post before deleting.');
    }
    for (const id of new Set(ids)) {
      db.prepare('DELETE FROM posts WHERE id=?').run(id);
      audit(actor, 'post-deleted', id);
    }
  });
}
export function deletePost(id, actor) {
  transaction(() => {
    const row = db.prepare('SELECT * FROM posts WHERE id=?').get(id);
    if (!row) throw new Error('Post not found.');
    if (row.published_version) throw new Error('Unpublish the article before deleting it.');
    if (db.prepare("SELECT id FROM jobs WHERE status IN ('queued','building')").get())
      throw new Error('Wait for publishing to finish before deleting a post.');
    db.prepare('DELETE FROM posts WHERE id=?').run(id);
    audit(actor, 'post-deleted', id);
    // Immutable revisions are retained for recovery; not exposed in the public release.
  });
}
