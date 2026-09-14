import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
mkdirSync('storage', { recursive: true });
process.env.STUDIO_DATA = mkdtempSync(path.resolve('storage/core-test-'));
process.env.STUDIO_SECRET = randomBytes(48).toString('hex');
process.env.STUDIO_ORIGIN = 'http://127.0.0.1:4340';
const { auth, initAuth, invite, changeMember, sessionFor } = await import('../src/lib/auth.mjs');
const { db } = await import('../src/lib/db.mjs');
const { savePost, getPost, deletePost, Conflict, cleanHtml, revision } =
  await import('../src/lib/content.mjs');
const { queuePublish, waitForWorker, releaseFile } = await import('../src/lib/publish.mjs');
const { studio } = await import('../src/lib/config.mjs');
studio.publish.manifest = path.join(process.env.STUDIO_DATA, 'published.json');
await initAuth();
let admin, post;
const image = randomUUID() + '.webp';
await sharp({ create: { width: 100, height: 100, channels: 3, background: '#447f66' } })
  .webp()
  .toFile(path.join(process.env.STUDIO_DATA, 'media', image));
const draft = {
  title: 'A useful first article',
  slug: 'first-article',
  excerpt: 'An introduction to our editorial workflow.',
  category: 'Guides',
  author: 'Example author',
  image,
  alt: 'A green editorial illustration',
  seo_title: '',
  seo_description: '',
  html: '<h2>A clear starting point</h2><p>Write useful, specific information for your readers.</p>',
  version: 0,
};
test('invite is one-time, activates membership, passwords hashed and last admin protected', async () => {
  admin = await invite({ name: 'Test owner', email: 'owner@example.test', role: 'admin' });
  const token = new URL(admin.url).pathname.split('/').at(-1);
  const password = randomBytes(24).toString('base64url');
  await auth.api.resetPassword({ body: { token, newPassword: password } });
  assert.equal(
    db.prepare('SELECT status FROM members WHERE user_id=?').get(admin.id).status,
    'active',
  );
  await assert.rejects(() => auth.api.resetPassword({ body: { token, newPassword: password } }));
  assert.notEqual(
    db.prepare('SELECT password FROM account WHERE userId=?').get(admin.id).password,
    password,
  );
  assert.throws(
    () => changeMember(admin.id, { status: 'disabled' }, admin.id),
    /active administrator/,
  );
  assert.throws(() => changeMember(admin.id, { role: 'editor' }, admin.id), /active administrator/);
  const response = await auth.api.signInEmail({
    body: { email: 'owner@example.test', password },
    asResponse: true,
  });
  assert.equal(response.status, 200);
  const cookie = response.headers
    .getSetCookie()
    .map((v) => v.split(';')[0])
    .join('; ');
  assert.equal((await sessionFor(new Headers({ cookie }))).role, 'admin');
  const second = await invite({ name: 'Other owner', email: 'second@example.test', role: 'admin' });
  assert.throws(() => changeMember(admin.id, { role: 'editor' }, admin.id), /active administrator/);
  const t = new URL(second.url).pathname.split('/').at(-1);
  await auth.api.resetPassword({ body: { token: t, newPassword: password } });
  changeMember(admin.id, { status: 'disabled' }, second.id);
  assert.equal(await sessionFor(new Headers({ cookie })), null);
  changeMember(admin.id, { status: 'active' }, second.id);
});
test('categories preserve content, published revisions and concurrent edit checks', async () => {
  const { listCategories, createCategory, renameCategory, deleteCategory } =
    await import('../src/lib/categories.mjs');
  const cat = createCategory('Clinic advice', admin.id);
  assert.throws(() => createCategory('clinic ADVICE', admin.id), /already exists/);
  assert.throws(() => createCategory('  ', admin.id));
  const p = savePost(null, { ...draft, slug: 'category-test', category: cat.name }, admin.id);
  db.prepare('UPDATE posts SET published_version=1 WHERE id=?').run(p.id);
  const original = revision(p.id, 1);
  renameCategory(cat.id, 'Clinic guides', admin.id);
  assert.equal(getPost(p.id).category, 'Clinic guides');
  assert.equal(getPost(p.id).version, 2);
  assert.equal(getPost(p.id).published_version, 1);
  assert.equal(revision(p.id, 1), original);
  assert.equal(getPost(p.id).html, p.html);
  assert.throws(
    () => savePost(p.id, { ...draft, category: 'Clinic guides', version: 1 }, admin.id),
    Conflict,
  );
  assert.throws(() => deleteCategory(cat.id, null, admin.id), /Choose another/);
  const target = listCategories().find((c) => c.name === 'Guides');
  deleteCategory(cat.id, target.id, admin.id);
  assert.equal(getPost(p.id).category, 'Guides');
  assert.equal(getPost(p.id).version, 3);
  assert.equal(revision(p.id, 1), original);
  assert.equal(getPost(p.id).published_version, 1);
  assert.throws(
    () =>
      savePost(null, { ...draft, slug: 'invalid-category', category: 'Clinic guides' }, admin.id),
    /category has changed/,
  );
  const empty = createCategory('Temporary', admin.id);
  deleteCategory(empty.id, null, admin.id);
  assert.ok(!listCategories().find((c) => c.id === empty.id));
  db.prepare('UPDATE posts SET published_version=NULL WHERE id=?').run(p.id);
  deletePost(p.id, admin.id);
});
test('draft versions cannot overwrite newer edits, unsafe HTML and paths rejected', () => {
  post = savePost(null, draft, admin.id);
  assert.equal(post.version, 1);
  const updated = savePost(
    post.id,
    { ...draft, title: 'A useful updated article', version: 1 },
    admin.id,
  );
  assert.equal(updated.version, 2);
  assert.throws(() => savePost(post.id, { ...draft, version: 1 }, admin.id), Conflict);
  assert.throws(() => savePost(null, { ...draft, slug: '../../private' }, admin.id));
  assert.throws(() => savePost(null, draft, admin.id), /already uses/);
  const sanitized = cleanHtml(
    '<script>alert(1)</script><img src="https://tracker.test/x" onerror="x"><a href="javascript:alert(1)">Test</a>',
  );
  assert.ok(!sanitized.includes('<script'));
  assert.ok(!sanitized.includes('javascript:'));
  assert.ok(!sanitized.includes('<img'));
  assert.ok(revision(post.id, 1).includes('A useful first article'));
});
test('publish builds real collection pages; draft changes remain private; unpublish removes output', async () => {
  const id = queuePublish(post.id, 'publish', admin.id);
  assert.throws(() => queuePublish(post.id, 'publish', admin.id), /already running/);
  await waitForWorker();
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
  if (job.status !== 'live')
    console.log(readFileSync(path.join(process.env.STUDIO_DATA, 'logs', id + '.log'), 'utf8'));
  assert.equal(job.status, 'live', job.error);
  const manifest = JSON.parse(readFileSync(studio.publish.manifest, 'utf8'));
  assert.equal(manifest.release, id);
  assert.ok(
    readFileSync(path.join(manifest.content, 'first-article.md'), 'utf8').includes(
      'A useful updated article',
    ),
  );
  const published = releaseFile('/blog/first-article/');
  assert.ok(published);
  assert.ok(readFileSync(published, 'utf8').includes('A useful updated article'));
  assert.ok(releaseFile('/search.json'));
  assert.ok(releaseFile('/rss.xml'));
  assert.ok(releaseFile('/sitemap.xml'));
  assert.ok(releaseFile('/media/' + image));
  savePost(post.id, { ...draft, title: 'Private unfinished title', version: 2 }, admin.id);
  assert.ok(
    !readFileSync(releaseFile('/blog/first-article/'), 'utf8').includes('Private unfinished title'),
  );
  assert.throws(
    () => savePost(post.id, { ...draft, slug: 'changed-url', version: 3 }, admin.id),
    /Unpublish/,
  );
  assert.throws(() => deletePost(post.id, admin.id), /Unpublish/);
  const oldCommand = studio.publish.command;
  studio.publish.command = 'missing-build-executable';
  const failed = queuePublish(post.id, 'publish', admin.id);
  await waitForWorker();
  studio.publish.command = oldCommand;
  assert.equal(db.prepare('SELECT status FROM jobs WHERE id=?').get(failed).status, 'failed');
  assert.equal(releaseFile('/blog/first-article/'), published);
  assert.equal(JSON.parse(readFileSync(studio.publish.manifest, 'utf8')).release, id);
  queuePublish(post.id, 'unpublish', admin.id);
  await waitForWorker();
  assert.equal(releaseFile('/blog/first-article/'), null);
  assert.equal(getPost(post.id).published_version, null);
  assert.notEqual(JSON.parse(readFileSync(studio.publish.manifest, 'utf8')).release, id);
  deletePost(post.id, admin.id);
  assert.equal(getPost(post.id), null);
});

test('multiple categories keep stable URLs and preserve other selections', async () => {
  const { createCategory, renameCategory, deleteCategory, listCategories } =
    await import('../src/lib/categories.mjs');
  const first = createCategory('Multi hair', admin.id),
    second = createCategory('Multi skin', admin.id);
  const p = savePost(
    null,
    { ...draft, slug: 'multi-category', categories: [first.name, second.name, first.name] },
    admin.id,
  );
  assert.deepEqual(p.categories, [first.name, second.name]);
  renameCategory(first.id, 'Hair advice', admin.id);
  assert.deepEqual(getPost(p.id).categories, ['Hair advice', second.name]);
  assert.equal(listCategories().find((c) => c.id === first.id).slug, first.slug);
  deleteCategory(first.id, second.id, admin.id);
  assert.deepEqual(getPost(p.id).categories, [second.name]);
  deletePost(p.id, admin.id);
});
test('image settings enforce output dimensions, ratios and supported formats', async () => {
  const { imageSettings, saveImageSettings, convertImage } =
    await import('../src/lib/image-settings.mjs');
  const original = imageSettings();
  const buffer = await sharp({
    create: { width: 900, height: 600, channels: 3, background: '#674bbc' },
  })
    .png()
    .toBuffer();
  for (const format of ['webp', 'jpeg', 'avif', 'png']) {
    const settings = {
      ...original,
      maxWidth: 640,
      maxHeight: 480,
      ratio: '16:9',
      format,
      quality: 72,
    };
    saveImageSettings(settings, admin.id);
    assert.equal(imageSettings().format, format);
    const output = await convertImage(buffer);
    const file = path.join(process.env.STUDIO_DATA, 'media', output.filename);
    const info = await sharp(file).metadata();
    assert.equal(info.width, 640);
    assert.equal(info.height, 360);
    assert.equal(info.format, format === 'avif' ? 'heif' : format);
    if (format === 'avif') await convertImage(readFileSync(file));
  }
  await assert.rejects(() => convertImage(Buffer.from('not an image')));
  assert.throws(() => saveImageSettings({ ...original, maxWidth: 99999 }, admin.id));
  assert.throws(() => saveImageSettings({ ...original, quality: 101 }, admin.id));
  saveImageSettings(original, admin.id);
});
test('bulk publishing activates and removes complete selections; bulk deletion is atomic', async () => {
  const { deletePosts } = await import('../src/lib/content.mjs');
  const a = savePost(null, { ...draft, slug: 'bulk-a' }, admin.id),
    b = savePost(null, { ...draft, slug: 'bulk-b' }, admin.id);
  assert.throws(() => queuePublish([a.id, randomUUID()], 'publish', admin.id), /Post not found/);
  const job = queuePublish([a.id, b.id], 'publish', admin.id);
  await waitForWorker();
  assert.equal(db.prepare('SELECT status FROM jobs WHERE id=?').get(job).status, 'live');
  assert.ok(releaseFile('/blog/bulk-a/'));
  assert.ok(releaseFile('/blog/bulk-b/'));
  const c = savePost(null, { ...draft, slug: 'bulk-c' }, admin.id);
  assert.throws(() => deletePosts([c.id, a.id], admin.id));
  assert.ok(getPost(c.id));
  queuePublish([a.id, b.id], 'unpublish', admin.id);
  await waitForWorker();
  assert.equal(releaseFile('/blog/bulk-a/'), null);
  assert.equal(releaseFile('/blog/bulk-b/'), null);
  deletePosts([a.id, b.id, c.id], admin.id);
  assert.equal(getPost(a.id), null);
  assert.equal(getPost(c.id), null);
});
