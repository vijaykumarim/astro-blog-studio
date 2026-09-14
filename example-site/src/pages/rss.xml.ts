import { getCollection } from 'astro:content';
const xml = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
export async function GET({ site }: { site: URL }) {
  const posts = await getCollection('posts');
  return new Response(
    `<?xml version="1.0"?><rss version="2.0"><channel><title>The Journal</title><link>${xml(site.href)}</link><description>Published articles</description>${posts.map(({ data: p }) => `<item><title>${xml(p.title)}</title><link>${xml(new URL('/blog/' + p.slug + '/', site).href)}</link><guid>${xml(new URL('/blog/' + p.slug + '/', site).href)}</guid><description>${xml(p.excerpt)}</description></item>`).join('')}</channel></rss>`,
    { headers: { 'Content-Type': 'application/rss+xml' } },
  );
}
