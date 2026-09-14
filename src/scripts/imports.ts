import { importBatches } from '../lib/import-batches.mjs';
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
const download = document.querySelector<HTMLInputElement>('#import-download')!;
const preview = document.querySelector<HTMLButtonElement>('#import-preview')!;
const run = document.querySelector<HTMLButtonElement>('#import-run')!;
const progress = document.querySelector<HTMLElement>('#import-progress')!;
const error = document.querySelector<HTMLElement>('#migration-error')!;
let posts: ImportPost[] = [];
async function sendBatches(route:string){
  const batches=importBatches(posts), rows:any[]=[];
  const createRedirects=document.querySelector<HTMLInputElement>('#import-redirects')!.checked;
  for(const [index,batch] of batches.entries()){
    progress.textContent=`${route==='imports'?'Importing':'Checking'} batch ${index+1} of ${batches.length} (${batch.posts.length} posts)… Keep this tab open.`;
    try {
      const result=await api(route,'POST',{posts:batch.posts,createRedirects});
      rows.push(...(result.rows||result.results).map((row:any)=>({...row,index:row.index+batch.offset})));
      if(route==='imports')report(rows);
    } catch(e) {
      throw Error(`${(e as Error).message} Stopped at batch ${index+1} of ${batches.length}. ${rows.filter(r=>r.status==='imported').length} drafts imported in this run. Retry the export; already imported posts are skipped.`);
    }
  }
  return rows;
}
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
      .map((i) => {
        const alt = Array.from(i.getElementsByTagNameNS('*', 'postmeta'))
          .find(m => text(m, 'meta_key') === '_wp_attachment_image_alt');
        return [text(i, 'post_id'), {url: text(i, 'attachment_url'),
          alt: plain(alt ? text(alt, 'meta_value') : '').slice(0,240),
          title: plain(text(i, 'title')).slice(0,240)}] as const;
      }),
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
        featuredUrl: attachments.get(meta.get('_thumbnail_id') || '')?.url || '',
        alt: attachments.get(meta.get('_thumbnail_id') || '')?.alt ||
          attachments.get(meta.get('_thumbnail_id') || '')?.title || '',
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
download.addEventListener('change', reset);
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
  download.disabled = true;
  try {
    const file = fileInput.files?.[0];
    if (!file) throw Error('Choose an XML or JSON export.');
    if (file.size > 100 * 1024 * 1024) throw Error('Choose an export up to 100 MB. Split larger files before importing.');
    posts = parseExport(await file.text());
    if (!Array.isArray(posts) || !posts.length)
      throw Error('The export must contain at least one post.');
    // Validate the complete batch before uploading any local media.
    posts = posts.map((p) => ({
      ...p,
      categories: p.categories?.length ? p.categories : ['Imported'],
    }));
    const initial = {rows:await sendBatches('imports/preview')};
    const ready = new Set(
      initial.rows.filter((r: any) => r.status === 'ready').map((r: any) => r.index),
    );
    const files = Array.from(mediaInput.files || []);
    const uploaded = new Map<string, string>();
    const failures = new Map<string,string>();
    async function imageFor(url: string) {
      if (!url) return '';
      if (uploaded.has(url)) return uploaded.get(url)!;
      if (failures.has(url)) return ''; 
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
      if (candidates.length !== 1) {
        if (!download.checked) return '';
        progress.textContent = `Attempting download ${uploaded.size + failures.size + 1}: ${pathname.split('/').at(-1)}`;
        try {
          const result = await api('imports/images', 'POST', {url});
          if (typeof result.filename !== 'string' || !/^[a-f0-9-]{36}\.(webp|avif|jpg|png)$/.test(result.filename)) throw Error('The server did not confirm a saved image.');
          uploaded.set(url, result.filename);
          return result.filename;
        } catch (e) {
          failures.set(url, (e as Error).message);
          return '';
        }
      }
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
      if (p.featuredUrl) {
        p.image = await imageFor(p.featuredUrl);
        if (!p.image) p.warnings.push('Missing featured image: ' + p.featuredUrl + '. ' + (failures.get(p.featuredUrl) || 'No matching local file.'));
      }
      const doc = new DOMParser().parseFromString(p.html, 'text/html');
      for (const img of Array.from(doc.querySelectorAll('img'))) {
        const source = img.getAttribute('data-src') || img.getAttribute('src') || '';
        if (source.startsWith('/media/')) continue;
        let resolved = '';
        try {
          resolved = new URL(source, p.sourceUrl).href;
        } catch {}
        const name = await imageFor(resolved);
        if (name) {
          img.setAttribute('src', '/media/' + name);
          img.removeAttribute('srcset');
          img.removeAttribute('data-src');
          img.removeAttribute('data-srcset');
          img.closest('picture')?.querySelectorAll('source').forEach(el => el.remove());
        } else {
          p.warnings.push('Missing inline image: ' + source.slice(0, 200) + '. ' + (failures.get(resolved) || 'No matching local file.'));
          img.remove();
        }
      }
      p.html = doc.body.innerHTML;
    }
    const result = {rows:await sendBatches('imports/preview')};
    report(result.rows);
    run.disabled = !result.rows.some((r: any) => r.status === 'ready');
    document.querySelector<HTMLElement>('#import-review')!.hidden = false;
    progress.textContent = `${result.rows.filter((r: any) => r.status === 'ready').length} ready to import. ${uploaded.size} images saved or reused. ${failures.size} downloads failed. To retry, click Preview import again before importing drafts.`;
  } catch (e) {
    error.textContent = (e as Error).message;
    error.hidden = false;
  } finally {
    preview.disabled = false;
    fileInput.disabled = false;
    mediaInput.disabled = false;
    download.disabled = false;
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
  download.disabled = true;
  error.hidden = true;
  try {
    const result = {results:await sendBatches('imports')};
    report(result.results);
    const missing = result.results.filter((r:any) => r.warnings?.some((w:string) => /Missing .*image|Featured image needs/i.test(w))).length;
    progress.textContent = `${result.results.filter((r: any) => r.status === 'imported').length} drafts imported. ${missing} posts need image fixes. Review the warnings below before publishing.`;
  } catch (e) {
    error.textContent = (e as Error).message;
    error.hidden = false;
    run.disabled = false;
  } finally {
    preview.disabled = false;
    fileInput.disabled = false;
    mediaInput.disabled = false;
    download.disabled = false;
  }
});
