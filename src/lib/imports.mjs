import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';
import { db } from './db.mjs';
import { savePost } from './content.mjs';
import { createCategory } from './categories.mjs';
import { saveRedirect, redirectPath } from './redirects.mjs';
const postSchema = z.object({
  sourceUrl: z.string().url().max(1500),
  title: z.string().trim().min(1).max(160),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100)
    .refine((s) => s !== 'category'),
  html: z.string().min(1).max(250000),
  excerpt: z.string().max(320).default(''),
  categories: z.array(z.string().trim().min(1).max(60)).min(1).max(10).default(['Imported']),
  author: z.string().min(1).max(100).default('Editorial team'),
  date: z.string().datetime({ offset: true }).optional(),
  image: z.string().default(''),
  alt: z.string().max(240).default(''),
  seo_title: z.string().max(160).default(''),
  seo_description: z.string().max(320).default(''),
  featuredUrl: z.string().max(1500).optional(),
  warnings: z.array(z.string().max(300)).max(100).default([]),
});
export function inspectImport(input) {
  if (!Array.isArray(input.posts) || !input.posts.length || input.posts.length > 200)
    throw new Error('Choose an export with 1–200 posts. Split larger exports into batches.');
  const seen = new Set(),
    slugs = new Set();
  return input.posts.map((raw, index) => {
    const parsed = postSchema.safeParse(raw);
    if (!parsed.success)
      return {
        index,
        title: String(raw?.title || 'Untitled').slice(0, 160),
        status: 'error',
        message: parsed.error.issues.map((i) => i.path.join('.') + ': ' + i.message).join(';'),
      };
    const post = parsed.data,
      url = new URL(post.sourceUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      return {
        index,
        title: post.title,
        status: 'error',
        message: 'Use an HTTP(S) source URL without credentials.',
      };
    url.hash = '';
    post.sourceUrl = url.href;
    const prior = db.prepare('SELECT imports.post_id,posts.slug FROM imports LEFT JOIN posts ON posts.id=imports.post_id WHERE source_url=?').get(post.sourceUrl);
    let status = 'ready',
      message = 'Create draft';
    if (prior?.post_id || seen.has(post.sourceUrl)) {
      status = 'skip';
      message = 'Already imported or repeated source URL';
    } else if (
      slugs.has(post.slug) ||
      db.prepare('SELECT id FROM posts WHERE slug=?').get(post.slug)
    ) {
      status = 'error';
      message = 'Another post uses this slug. Change it in the export and preview again.';
    }
    seen.add(post.sourceUrl);
    slugs.add(post.slug);
    const warnings = [...post.warnings];
    if (!post.image) warnings.push('Featured image needs uploading before publishing.');
    if (/<img\b/i.test(post.html) && /<img\b[^>]*src=["'](?!\/media\/)/i.test(post.html))
      warnings.push(
        'Some inline images have not been matched to uploaded media and will be removed.',
      );
    if (/\[(?:gallery|caption|vc_|elementor|embed)/i.test(post.html))
      warnings.push('Review shortcodes or page-builder content in the editor.');
    let from = '';
    try {
      if (url.search) throw Error();
      from = redirectPath(url.pathname);
    } catch {
      warnings.push(
        'This source URL needs a manual server redirect (query, encoded or unsupported path).',
      );
    }
    return {
      index,
      title: post.title,
      status,
      message,
      warnings,
      post,
      from,
      to: '/blog/' + (prior?.slug || post.slug) + '/',
    };
  });
}
export function runImport(input, actor) {
  const rows = inspectImport(input),
    results = [];
  // Only link to posts that already exist or will be imported in this batch.
  const links = new Map(
    rows
      .filter((r) => r.status === 'ready' || r.status === 'skip')
      .filter((r) => r.post)
      .map((r) => [r.post.sourceUrl, r.to]),
  );
  for (const row of rows) {
    if (row.status !== 'ready') {
      results.push({
        index: row.index,
        title: row.title,
        status: row.status,
        message: row.message,
      });
      continue;
    }
    const post = row.post;
    try {
      const categories = post.categories.map((name) => {
        const existing = db.prepare('SELECT name FROM categories WHERE name=?').get(name);
        return existing?.name || createCategory(name, actor).name;
      });
      const html = sanitizeHtml(post.html, {
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
        transformTags: {
          a: (tag, attrs) => {
            try {
              const u = new URL(attrs.href, post.sourceUrl);
              const hash = u.hash;
              u.hash = '';
              if (links.has(u.href)) attrs.href = links.get(u.href) + hash;
            } catch {}
            return { tagName: tag, attribs: attrs };
          },
        },
      });
      const saved = savePost(null, { ...post, html, categories, version: 0 }, actor, {
        createdAt: post.date,
        sourceUrl: post.sourceUrl,
      });
      let redirect = '';
      if (input.createRedirects && row.from && row.from !== row.to) {
        try {
          saveRedirect(null, { from: row.from, to: row.to, status: 301 }, actor);
          redirect = 'Redirect saved; export after publishing.';
        } catch (e) {
          redirect = 'Draft saved; redirect needs review: ' + e.message;
        }
      }
      results.push({
        index: row.index,
        title: row.title,
        status: 'imported',
        id: saved.id,
        message: redirect || 'Draft created',
        warnings: row.warnings,
      });
    } catch (e) {
      results.push({ index: row.index, title: row.title, status: 'error', message: e.message });
    }
  }
  return { results };
}
