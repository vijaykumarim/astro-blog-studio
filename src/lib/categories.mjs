import { randomUUID } from 'node:crypto';
import { db, transaction, audit, postCategories, categorySlug } from './db.mjs';
import { revision, splitDocument, atomicWrite, draftPath } from './content.mjs';
export function listCategories() {
  const posts = db.prepare('SELECT category,categories_json FROM posts').all();
  return db
    .prepare('SELECT * FROM categories ORDER BY name COLLATE NOCASE')
    .all()
    .map((row) => ({
      id: String(row.id),
      name: String(row.name),
      slug: String(row.slug),
      posts: posts.filter((p) => postCategories(p).includes(row.name)).length,
    }));
}
function validName(input) {
  if (typeof input !== 'string') throw new Error('Enter a category name.');
  const name = input.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 60 || /[\x00-\x1f<>]/.test(name))
    throw new Error('Use a category name of 1–60 characters without markup.');
  return name;
}
function requireAvailable(name, id) {
  if (db.prepare('SELECT id FROM categories WHERE name=? AND id!=?').get(name, id ?? ''))
    throw new Error('A category with that name already exists.');
}
function requireIdle() {
  if (db.prepare("SELECT id FROM jobs WHERE status IN ('queued','building')").get())
    throw new Error('Wait for publishing to finish before changing categories.');
}
// Update draft revisions only. Published snapshots remain stable until the post is published again.
function movePosts(from, to, actor) {
  const rows = db
    .prepare('SELECT * FROM posts')
    .all()
    .filter((row) => postCategories(row).includes(from));
  const now = new Date().toISOString();
  for (const row of rows) {
    const { data, body } = splitDocument(revision(row.id, row.version));
    const categories = [...new Set(postCategories(row).map((name) => (name === from ? to : name)))];
    const categoryLinks = categories.map((name) =>
      db.prepare('SELECT name,slug FROM categories WHERE name=?').get(name),
    );
    atomicWrite(
      draftPath(row.id, row.version + 1),
      `---\n${JSON.stringify({ ...data, category: categories[0], categories, categoryLinks, updated_at: now }, null, 2)}\n---\n${body}`,
    );
    db.prepare(
      'UPDATE posts SET category=?,version=version+1,updated_at=?,categories_json=? WHERE id=?',
    ).run(categories[0], now, JSON.stringify(categories), row.id);
    audit(actor, 'draft-category-changed', row.id);
  }
  return rows.length;
}
export function createCategory(input, actor) {
  return transaction(() => {
    const name = validName(input);
    requireAvailable(name);
    const id = randomUUID();
    const slug = categorySlug(name, id);
    db.prepare('INSERT INTO categories(id,name,slug) VALUES(?,?,?)').run(id, name, slug);
    audit(actor, 'category-created', id);
    return { id, name, slug, posts: 0 };
  });
}
export function renameCategory(id, input, actor) {
  return transaction(() => {
    requireIdle();
    const current = db.prepare('SELECT * FROM categories WHERE id=?').get(id);
    if (!current) throw new Error('Category not found.');
    const name = validName(input);
    requireAvailable(name, id);
    if (name === current.name) return { changed: 0 };
    db.prepare('UPDATE categories SET name=? WHERE id=?').run(name, id);
    const changed = movePosts(current.name, name, actor);
    audit(actor, 'category-renamed', id);
    return { changed };
  });
}
export function deleteCategory(id, replacementId, actor) {
  return transaction(() => {
    requireIdle();
    const current = db.prepare('SELECT * FROM categories WHERE id=?').get(id);
    if (!current) throw new Error('Category not found.');
    if (db.prepare('SELECT count(*) AS n FROM categories').get().n <= 1)
      throw new Error('Keep at least one category.');
    const count = listCategories().find((c) => c.id === id).posts;
    let changed = 0;
    if (count) {
      const target = db
        .prepare('SELECT * FROM categories WHERE id=? AND id!=?')
        .get(replacementId ?? '', id);
      if (!target) throw new Error('Choose another category for these posts.');
      changed = movePosts(current.name, target.name, actor);
    }
    db.prepare('DELETE FROM categories WHERE id=?').run(id);
    audit(actor, 'category-deleted', id);
    return { changed };
  });
}
