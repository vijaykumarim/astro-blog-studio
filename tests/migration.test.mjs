import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
mkdirSync('storage', { recursive: true });
process.env.STUDIO_DATA = mkdtempSync(path.resolve('storage/migration-test-'));
process.env.STUDIO_SECRET = randomBytes(48).toString('hex');
const { db } = await import('../src/lib/db.mjs');
const { inspectImport, runImport } = await import('../src/lib/imports.mjs');
const { getPost, deletePost, revision, splitDocument } = await import('../src/lib/content.mjs');
const { saveRedirect, listRedirects, exportRedirects, redirectPath } =
  await import('../src/lib/redirects.mjs');
const post = {
  sourceUrl: 'https://old.example.com/old-story/',
  title: 'Imported story',
  slug: 'imported-story',
  html: '<h2>Original heading</h2><p>Original text<script>alert(1)</script></p>',
  categories: ['Migration'],
  author: 'Original writer',
  date: '2020-02-15T12:00:00Z',
};
test('imports create dated drafts, sanitize content, preserve source identity and defer redirects', () => {
  const plan = inspectImport({ posts: [post] });
  assert.equal(plan[0].status, 'ready');
  assert.equal(db.prepare('SELECT count(*) n FROM posts').get().n, 0);
  const result = runImport({ posts: [post], createRedirects: true }, 'test');
  assert.equal(result.results[0].status, 'imported');
  const p = getPost(result.results[0].id);
  assert.equal(p.created_at, post.date);
  assert.equal(p.published_version, null);
  assert.equal(p.author, post.author);
  assert.doesNotMatch(p.html, /script|alert/);
  assert.equal(splitDocument(revision(p.id, p.version)).data.created_at, post.date);
  assert.equal(runImport({ posts: [post] }, 'test').results[0].status, 'skip');
  assert.equal(listRedirects().length, 1);
  assert.deepEqual(JSON.parse(exportRedirects('json')), []);
  db.prepare('UPDATE posts SET published_version=version WHERE id=?').run(p.id);
  assert.equal(JSON.parse(exportRedirects('json'))[0].from, '/old-story/');
  assert.match(exportRedirects('nginx'), /location = \/old-story\//);
  assert.match(exportRedirects('apache'), /RedirectMatch 301/);
  db.prepare('UPDATE posts SET published_version=NULL WHERE id=?').run(p.id);
  assert.deepEqual(JSON.parse(exportRedirects('json')), []);
  deletePost(p.id, 'test');
  assert.equal(inspectImport({ posts: [post] })[0].status, 'ready');
});
test('preview rejects bad records and slug collisions without overwriting', () => {
  assert.throws(() => inspectImport({ posts: [] }), /1–250/);
  assert.equal(
    inspectImport({ posts: [{ ...post, sourceUrl: 'file:///etc/passwd' }] })[0].status,
    'error',
  );
  assert.equal(inspectImport({ posts: [{ ...post, slug: '../../bad' }] })[0].status, 'error');
  const rows = inspectImport({
    posts: [post, { ...post, sourceUrl: 'https://old.example.com/other/' }],
  });
  assert.equal(rows[1].status, 'error');
  assert.equal(
    inspectImport({ posts: [{ ...post, sourceUrl: 'https://old.example.com/?p=123' }] })[0].from,
    '',
  );
});
test('redirect validation prevents configuration injection, external URLs, duplicates and chains', () => {
  for (const from of [
    '//evil.test/x',
    '/x?y=1',
    '/x\nreturn 200;',
    '/../x',
    '/%2e%2e/x',
    '/x{',
    '/',
  ])
    assert.throws(() => redirectPath(from));
  const a = saveRedirect(null, { from: '/legacy/', to: '/new/', status: 301 }, 'test');
  assert.throws(() => saveRedirect(null, { from: '/legacy/', to: '/another/' }, 'test'), /already/);
  assert.throws(() => saveRedirect(null, { from: '/new/', to: '/final/' }, 'test'), /chains/);
  assert.throws(() => saveRedirect(null, { from: '/self/', to: '/self/' }, 'test'), /different/);
  assert.throws(() => saveRedirect(null, { from: '/external/', to: 'https://evil.test/' }, 'test'));
  saveRedirect(a.id, { from: '/legacy/', to: '/new/', enabled: false }, 'test');
  assert.doesNotMatch(exportRedirects('nginx'), /legacy/);
});


test('large exports split into sequential bounded batches without dropping rows', async()=>{
 const {importBatches}=await import('../src/lib/import-batches.mjs');
 const posts=Array.from({length:751},(_,id)=>({id,html:'text'}));
 const batches=importBatches(posts);
 assert.deepEqual(batches.map(b=>b.posts.length),[250,250,250,1]);
 assert.deepEqual(batches.map(b=>b.offset),[0,250,500,750]);
 assert.deepEqual(batches.flatMap(b=>b.posts),posts);
 const large=importBatches(Array.from({length:100},()=>({html:'a'.repeat(200000)})));
 assert.ok(large.every(b=>b.posts.length<250));
 assert.equal(large.flatMap(b=>b.posts).length,100);
 assert.throws(()=>importBatches([{html:'x'.repeat(9*1024*1024)}]),/request limit/);
});


test('missing excerpts use readable article text while supplied metadata is preserved', async () => {
  const {importExcerpt}=await import('../src/lib/import-metadata.mjs');
  assert.equal(importExcerpt('<p>Skin &amp; hair.</p><p>More care.</p><script>bad()</script>'),'Skin & hair. More care.');
  assert.ok(importExcerpt('<p>'+('A longer article sentence. '.repeat(100))+'</p>').length<=280);
  const automatic=inspectImport({posts:[{...post,slug:'automatic-excerpt'}]})[0];
  assert.equal(automatic.post.excerpt,'Original heading Original text');
  const original=inspectImport({posts:[{...post,excerpt:'Original summary',alt:'Original image description'}]})[0];
  assert.equal(original.post.excerpt,'Original summary');assert.equal(original.post.alt,'Original image description');
});
