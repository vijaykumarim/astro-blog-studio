import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { dataDir, studio } from './config.mjs';
import { randomUUID } from 'node:crypto';
export const db = new DatabaseSync(path.join(dataDir, 'studio.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS members(user_id TEXT PRIMARY KEY,role TEXT NOT NULL CHECK(role IN ('admin','editor')),status TEXT NOT NULL CHECK(status IN ('invited','active','disabled')));
CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY,slug TEXT NOT NULL UNIQUE,title TEXT NOT NULL,excerpt TEXT NOT NULL,category TEXT NOT NULL,author TEXT NOT NULL,image TEXT NOT NULL,alt TEXT NOT NULL,seo_title TEXT NOT NULL,seo_description TEXT NOT NULL,version INTEGER NOT NULL, published_version INTEGER,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,status TEXT NOT NULL,action TEXT NOT NULL,post_id TEXT,version INTEGER,created_at TEXT NOT NULL,finished_at TEXT,error TEXT,release TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS one_publish_job ON jobs((1)) WHERE status IN ('queued','building');
CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,filename TEXT NOT NULL,alt TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS imports(source_url TEXT PRIMARY KEY,post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,imported_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS redirects(id TEXT PRIMARY KEY,source TEXT NOT NULL UNIQUE,destination TEXT NOT NULL,status INTEGER NOT NULL DEFAULT 301,enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS redirect_destination ON redirects(destination);
CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS categories(id TEXT PRIMARY KEY,name TEXT NOT NULL COLLATE NOCASE UNIQUE);
`);
transaction(() => {
  if (
    !db
      .prepare('PRAGMA table_info(posts)')
      .all()
      .some((c) => c.name === 'categories_json')
  ) {
    db.exec("ALTER TABLE posts ADD COLUMN categories_json TEXT NOT NULL DEFAULT '[]'");
    for (const post of db.prepare('SELECT id,category FROM posts').all())
      db.prepare('UPDATE posts SET categories_json=? WHERE id=?').run(
        JSON.stringify([post.category]),
        post.id,
      );
  }
  if (
    !db
      .prepare('PRAGMA table_info(jobs)')
      .all()
      .some((c) => c.name === 'items_json')
  )
    db.exec("ALTER TABLE jobs ADD COLUMN items_json TEXT NOT NULL DEFAULT '[]'");
  if (
    !db
      .prepare('PRAGMA table_info(categories)')
      .all()
      .some((c) => c.name === 'slug')
  )
    db.exec('ALTER TABLE categories ADD COLUMN slug TEXT');
  if (!db.prepare("SELECT value FROM state WHERE key='categories_initialized'").get()) {
    const names = [
      ...studio.categories,
      ...db
        .prepare('SELECT DISTINCT category FROM posts')
        .all()
        .map((p) => p.category),
    ];
    for (const name of names)
      db.prepare('INSERT OR IGNORE INTO categories(id,name) VALUES(?,?)').run(randomUUID(), name);
    db.prepare("INSERT INTO state(key,value) VALUES('categories_initialized','1')").run();
  }
  for (const c of db.prepare('SELECT id,name FROM categories WHERE slug IS NULL').all())
    db.prepare('UPDATE categories SET slug=? WHERE id=?').run(categorySlug(c.name, c.id), c.id);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS category_slug ON categories(slug)');
});
export function categorySlug(name, id) {
  const base =
    String(name)
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'category';
  return db.prepare('SELECT id FROM categories WHERE slug=?').get(base)
    ? base + '-' + String(id).slice(0, 8)
    : base;
}
export function postCategories(row) {
  try {
    const names = JSON.parse(row.categories_json || '[]');
    return names.length ? names : [row.category];
  } catch {
    return [row.category];
  }
}
export const audit = (actor, action, target) =>
  db
    .prepare('INSERT INTO activity(actor,action,target,at) VALUES(?,?,?,?)')
    .run(actor, action, target, new Date().toISOString());
export function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
