import { api } from './dashboard';
import { confirmAction } from './dialogs';
type ImportPost = {
  sourceUrl: string;
  title: string;
  slug: string;
  html: string;
  excerpt?: string;
  categories?: string[];
  author?: string;
  date?: string;
  featuredUrl?: string;
  image?: string;
  alt?: string;
  seo_title?: string;
  seo_description?: string;
  warnings?: string[];
};
const fileInput = document.querySelector<HTMLInputElement>('#import-file')!;
const mediaInput = document.querySelector<HTMLInputElement>('#import-media')!;
const preview = document.querySelector<HTMLButtonElement>('#import-preview')!;
const run = document.querySelector<HTMLButtonElement>('#import-run')!;
const progress = document.querySelector<HTMLElement>('#import-progress')!;
const error = document.querySelector<HTMLElement>('#migration-error')!;
let posts: ImportPost[] = [];
function text(el: Element, local: string) {
  return el.getElementsByTagNameNS('*', local)[0]?.textContent?.trim() || '';
}
function plain(value: string) {
  return new DOMParser().parseFromString(value, 'text/html').body.textContent?.trim() || '';
}
function parseExport(source: string): ImportPost[] {
  if (source.trimStart().startsWith('{') || source.trimStart().startsWith('[')) {
    const data = JSON.parse(source);
    return Array.isArray(data) ? data : data.posts;
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(source))
    throw Error('XML declarations with DTDs or entities are not supported.');
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.querySelector('parsererror') || !text(doc.documentElement, 'wxr_version'))
    throw Error('Choose a valid WordPress XML export or JSON file.');
  const items = Array.from(doc.getElementsByTagName('item'));
  const attachments = new Map(
    items
      .filter((i) => text(i, 'post_type') === 'attachment')
      .map((i) => [text(i, 'post_id'), text(i, 'attachment_url')]),
  );
  return items
    .filter(
      (i) =>
        text(i, 'post_type') === 'post' &&
        ['publish', 'draft', 'pending', 'future'].includes(text(i, 'status')),
    )
    .map((i) => {
      const meta = new Map(
        Array.from(i.getElementsByTagNameNS('*', 'postmeta')).map((m) => [
          text(m, 'meta_key'),
          text(m, 'meta_value'),
        ]),
      );
      const title = text(i, 'title');
      const date = text(i, 'post_date_gmt');
      return {
        sourceUrl: text(i, 'link'),
        title,
        slug:
          text(i, 'post_name') ||
          title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, ''),
        html:
          i.getElementsByTagNameNS('http://purl.org/rss/1.0/modules/content/', 'encoded')[0]
            ?.textContent || '',
        excerpt: plain(
          i.getElementsByTagNameNS('http://wordpress.org/export/1.2/excerpt/', 'encoded')[0]
            ?.textContent || '',
        ).slice(0, 320),
        categories: Array.from(i.getElementsByTagName('category'))
          .filter((c) => c.getAttribute('domain') === 'category')
          .map((c) => c.textContent || 'Imported')
          .slice(0, 10),
        author: text(i, 'creator') || 'Editorial team',
        ...(date && !date.startsWith('0000') ? { date: date.replace(' ', 'T') + 'Z' } : {}),
        featuredUrl: attachments.get(meta.get('_thumbnail_id') || '') || '',
        seo_title: meta.get('_yoast_wpseo_title') || meta.get('rank_math_title') || '',
        seo_description:
          meta.get('_yoast_wpseo_metadesc') || meta.get('rank_math_description') || '',
      };
    });
}
function reset() {
  posts = [];
  document.querySelector<HTMLElement>('#import-review')!.hidden = true;
  run.disabled = false;
}
fileInput.addEventListener('change', reset);
mediaInput.addEventListener('change', reset);
function report(rows: any[]) {
  const list = document.querySelector('#import-rows')!;
  list.replaceChildren();
  for (const row of rows) {
    const card = document.createElement('div');
    card.className = 'migration-row';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `${row.status}: ${row.title}`;
    copy.append(title);
    const detail = document.createElement('p');
    detail.textContent = [row.message, ...(row.warnings || [])].join(' ');
    copy.append(detail);
    card.append(copy);
    if (row.id) {
      const link = document.createElement('a');
      link.href = '/posts/' + encodeURIComponent(row.id);
      link.textContent = 'Review draft →';
      card.append(link);
    }
    list.append(card);
  }
}
preview.addEventListener('click', async () => {
  error.hidden = true;
  reset();
  preview.disabled = true;
  fileInput.disabled = true;
  mediaInput.disabled = true;
  try {
    const file = fileInput.files?.[0];
    if (!file) throw Error('Choose an XML or JSON export.');
    if (file.size > 8 * 1024 * 1024) throw Error('Split exports larger than 8 MB.');
    posts = parseExport(await file.text());
    if (!Array.isArray(posts) || !posts.length || posts.length > 200)
      throw Error('Choose 1–200 posts per batch.');
    // Validate the complete batch before uploading any local media.
    posts = posts.map((p) => ({
      ...p,
      categories: p.categories?.length ? p.categories : ['Imported'],
    }));
    const initial = await api('imports/preview', 'POST', { posts });
    const ready = new Set(
      initial.rows.filter((r: any) => r.status === 'ready').map((r: any) => r.index),
    );
    const files = Array.from(mediaInput.files || []);
    const uploaded = new Map<string, string>();
    async function imageFor(url: string) {
      if (!url) return '';
      let pathname: string;
      try {
        pathname = decodeURIComponent(new URL(url).pathname);
      } catch {
        return '';
      }
      const exact = files.filter((f) =>
        pathname.endsWith('/' + f.webkitRelativePath.split('/').slice(1).join('/')),
      );
      const candidates = exact.length
        ? exact
        : files.filter((f) => f.name === pathname.split('/').at(-1));
      if (candidates.length !== 1) return '';
      const image = candidates[0],
        key = image.webkitRelativePath || image.name;
      if (uploaded.has(key)) return uploaded.get(key)!;
      progress.textContent = 'Uploading image: ' + image.name;
      const form = new FormData();
      form.set('file', image);
      const response = await fetch('/api/media', { method: 'POST', body: form });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Image upload failed.');
      uploaded.set(key, result.filename);
      return result.filename;
    }
    for (const [index, p] of posts.entries()) {
      if (!ready.has(index)) continue;
      p.categories = p.categories?.length ? p.categories : ['Imported'];
      p.warnings = p.warnings || [];
      if (p.featuredUrl) p.image = await imageFor(p.featuredUrl);
      const doc = new DOMParser().parseFromString(p.html, 'text/html');
      for (const img of Array.from(doc.querySelectorAll('img'))) {
        const source = img.getAttribute('src') || '';
        if (source.startsWith('/media/')) continue;
        let resolved = '';
        try {
          resolved = new URL(source, p.sourceUrl).href;
        } catch {}
        const name = await imageFor(resolved);
        if (name) {
          img.setAttribute('src', '/media/' + name);
          img.removeAttribute('srcset');
        } else {
          p.warnings.push('Missing inline image: ' + source.slice(0, 200));
          img.remove();
        }
      }
      p.html = doc.body.innerHTML;
    }
    const result = await api('imports/preview', 'POST', { posts });
    report(result.rows);
    run.disabled = !result.rows.some((r: any) => r.status === 'ready');
    document.querySelector<HTMLElement>('#import-review')!.hidden = false;
    progress.textContent = `${result.rows.filter((r: any) => r.status === 'ready').length} ready to import. ${uploaded.size} images uploaded.`;
  } catch (e) {
    error.textContent = (e as Error).message;
    error.hidden = false;
  } finally {
    preview.disabled = false;
    fileInput.disabled = false;
    mediaInput.disabled = false;
  }
});
run.addEventListener('click', async () => {
  if (
    !(await confirmAction({
      title: 'Import as drafts?',
      message:
        'Create ready posts and categories. Nothing will be published. Repeating the same source URLs will skip existing imports.',
      accept: 'Import drafts',
    }))
  )
    return;
  run.disabled = true;
  preview.disabled = true;
  fileInput.disabled = true;
  mediaInput.disabled = true;
  error.hidden = true;
  try {
    const result = await api('imports', 'POST', {
      posts,
      createRedirects: document.querySelector<HTMLInputElement>('#import-redirects')!.checked,
    });
    report(result.results);
    progress.textContent = `${result.results.filter((r: any) => r.status === 'imported').length} drafts imported. Review them before publishing.`;
  } catch (e) {
    error.textContent = (e as Error).message;
    error.hidden = false;
    run.disabled = false;
  } finally {
    preview.disabled = false;
    fileInput.disabled = false;
    mediaInput.disabled = false;
  }
});
