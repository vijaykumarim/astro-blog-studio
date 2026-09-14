import path from 'node:path';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  cpSync,
  readdirSync,
  statSync,
  realpathSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { db, audit, transaction } from './db.mjs';
import { dataDir, root, studio, inside } from './config.mjs';
import { revision, splitDocument, atomicWrite } from './content.mjs';
let worker;
export function recoverJobs() {
  db.prepare(
    "UPDATE jobs SET status='failed',finished_at=?,error='Publishing was interrupted. The previous active release was kept. Retry publishing.' WHERE status IN ('queued','building')",
  ).run(new Date().toISOString());
}
export function queuePublish(id, action, actor) {
  if (!['publish', 'unpublish', 'rebuild'].includes(action))
    throw new Error('Invalid publishing action.');
  const job = transaction(() => {
    if (db.prepare("SELECT id FROM jobs WHERE status IN ('queued','building')").get())
      throw new Error('A publish is already running. Please wait.');
    const ids = Array.isArray(id) ? [...new Set(id)] : id ? [id] : [];
    if (action !== 'rebuild' && (!ids.length || ids.length > 100))
      throw new Error('Select 1–100 posts.');
    const items = ids.map((id) => {
      const post = db.prepare('SELECT * FROM posts WHERE id=?').get(id);
      if (!post) throw new Error('Post not found.');
      if (action === 'publish') {
        const doc = splitDocument(revision(id, post.version));
        if (!post.excerpt || !post.image || !post.alt || doc.body.trim().length < 20)
          throw new Error(
            'Complete the text, excerpt, image and image description for every selected post.',
          );
      }
      return { id, version: post.version };
    });
    const job = {
      id: randomUUID(),
      action,
      post_id: items.length === 1 ? items[0].id : null,
      version: items.length === 1 ? items[0].version : null,
      items,
    };
    db.prepare(
      "INSERT INTO jobs(id,status,action,post_id,version,created_at,items_json) VALUES(?,'queued',?,?,?,?,?)",
    ).run(
      job.id,
      action,
      job.post_id,
      job.version,
      new Date().toISOString(),
      JSON.stringify(items),
    );
    audit(actor, action + '-queued', job.id);
    return job;
  });
  worker = runJob(job);
  return job.id;
}
export const waitForWorker = () => worker;
function runBuild(project, env, log) {
  return new Promise((resolve, reject) => {
    const child = spawn(studio.publish.command, studio.publish.args, {
      cwd: project,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Build timed out. Review server capacity and retry.'));
    }, studio.publish.timeoutMs ?? 180000);
    let length = 0;
    const record = (chunk) => {
      if (length < 200000) {
        log.push(chunk.toString());
        length += chunk.length;
      }
    };
    child.stdout.on('data', record);
    child.stderr.on('data', record);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve()
        : reject(new Error('Astro build failed. Review the private build log.'));
    });
  });
}
export async function runJob(job) {
  const logs = [];
  try {
    db.prepare("UPDATE jobs SET status='building' WHERE id=?").run(job.id);
    const snapshot = inside(path.join(dataDir, 'snapshots'), job.id);
    mkdirSync(snapshot, { recursive: true });
    const versions = db
      .prepare('SELECT id,published_version FROM posts WHERE published_version IS NOT NULL')
      .all();
    const selected = new Map(versions.map((p) => [p.id, p.published_version]));
    const items = job.items ?? (job.post_id ? [{ id: job.post_id, version: job.version }] : []);
    for (const item of items) {
      if (job.action === 'publish') selected.set(item.id, item.version);
      if (job.action === 'unpublish') selected.delete(item.id);
    }
    const posts = [];
    for (const [id, version] of selected) {
      const document = revision(id, version);
      const { data, body } = splitDocument(document);
      posts.push({ ...data, body });
      writeFileSync(path.join(snapshot, data.slug + '.md'), document);
    }
    const mediaDir = path.join(snapshot, 'media');
    mkdirSync(mediaDir);
    const assets = new Set(
      posts
        .flatMap((p) => [
          p.image,
          ...Array.from(
            p.body.matchAll(/\/media\/([a-f0-9-]{36}\.(?:webp|avif|jpg|png))/g),
            (m) => m[1],
          ),
        ])
        .filter(Boolean),
    );
    for (const file of assets)
      cpSync(inside(path.join(dataDir, 'media'), file), inside(mediaDir, file));
    const project = path.resolve(root, studio.publish.project);
    const buildOutput = path.join(snapshot, 'build');
    // Forward only build necessities: dashboard secrets never enter the website build environment.
    const env = Object.fromEntries(
      [
        'PATH',
        'Path',
        'SystemRoot',
        'WINDIR',
        'TEMP',
        'TMP',
        'HOME',
        'USERPROFILE',
        'COMSPEC',
        'PATHEXT',
      ]
        .filter((k) => process.env[k])
        .map((k) => [k, process.env[k]]),
    );
    Object.assign(env, {
      NODE_ENV: 'production',
      STUDIO_CONTENT_DIR: snapshot,
      STUDIO_MEDIA_DIR: mediaDir,
      STUDIO_SITE_URL: studio.siteUrl,
      STUDIO_BUILD_DIR: buildOutput,
      STUDIO_CACHE_DIR: path.join(snapshot, 'cache'),
    });
    await runBuild(project, env, logs);
    if (!existsSync(path.join(buildOutput, 'blog', 'index.html')))
      throw new Error('The site build must include /blog/index.html.');
    for (const post of posts)
      if (!existsSync(path.join(buildOutput, 'blog', post.slug, 'index.html')))
        throw new Error('The build did not create every published article.');
    const allowed = new Set([...posts.map((p) => p.slug), 'category']);
    const categoryRoot = path.join(buildOutput, 'blog', 'category');
    if (existsSync(categoryRoot)) {
      const expected = new Set(
        posts.flatMap(
          (p) =>
            p.categoryLinks?.map((c) => c.slug) ??
            (p.categories || [p.category]).map(
              (name) =>
                name
                  .normalize('NFKD')
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, '') || 'category',
            ),
        ),
      );
      for (const entry of readdirSync(categoryRoot, { withFileTypes: true }))
        if (entry.isDirectory() && !expected.has(entry.name))
          throw new Error('Unexpected category output.');
    }
    for (const dir of readdirSync(path.join(buildOutput, 'blog'), { withFileTypes: true }))
      if (dir.isDirectory() && !allowed.has(dir.name))
        throw new Error('The build contains an unpublished article. Check the collection loader.');
    const release = inside(path.join(dataDir, 'releases'), job.id);
    cpSync(buildOutput, release, { recursive: true });
    // Atomic SQLite pointer swap: readers get either the complete old or complete new release.
    transaction(() => {
      if (db.prepare('SELECT status FROM jobs WHERE id=?').get(job.id)?.status !== 'building')
        throw new Error('This publishing job was interrupted. Retry from the editor.');
      for (const item of items) {
        if (job.action === 'publish')
          db.prepare('UPDATE posts SET published_version=? WHERE id=?').run(item.version, item.id);
        if (job.action === 'unpublish')
          db.prepare('UPDATE posts SET published_version=NULL WHERE id=?').run(item.id);
      }
      db.prepare(
        "INSERT INTO state(key,value) VALUES('active_release',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      ).run(job.id);
      db.prepare("UPDATE jobs SET status='live',finished_at=?,release=? WHERE id=?").run(
        new Date().toISOString(),
        job.id,
        job.id,
      );
    });
    // Optional local Astro bridge. Export only the successfully activated snapshot.
    // A bridge failure must not misreport an already activated release as failed.
    if (studio.publish.manifest) {
      try {
        const manifest = path.resolve(root, studio.publish.manifest);
        mkdirSync(path.dirname(manifest), { recursive: true });
        atomicWrite(
          manifest,
          JSON.stringify({ release: job.id, content: snapshot, media: mediaDir }),
        );
      } catch (error) {
        db.prepare('UPDATE jobs SET error=? WHERE id=?').run(
          'Release activated; local content bridge needs a rebuild: ' +
            String(error.message).slice(0, 300),
          job.id,
        );
      }
    }
  } catch (error) {
    db.prepare("UPDATE jobs SET status='failed',finished_at=?,error=? WHERE id=?").run(
      new Date().toISOString(),
      String(error.message).slice(0, 500),
      job.id,
    );
  } finally {
    writeFileSync(path.join(dataDir, 'logs', job.id + '.log'), logs.join(''), { mode: 0o600 });
  }
}
export function releaseFile(urlPath) {
  const active = db.prepare("SELECT value FROM state WHERE key='active_release'").get()?.value;
  if (!active) return null;
  const release = inside(path.join(dataDir, 'releases'), active);
  let relative = decodeURIComponent(urlPath).replace(/^\/+/, '');
  if (relative.endsWith('/') || !relative) relative += 'index.html';
  if (!path.extname(relative)) relative += '/index.html';
  const file = inside(release, relative);
  if (!existsSync(file) || !statSync(file).isFile()) return null;
  if (!realpathSync(file).startsWith(realpathSync(release) + path.sep)) return null;
  return file;
}
