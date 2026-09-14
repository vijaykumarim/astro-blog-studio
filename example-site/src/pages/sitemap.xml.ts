import { getCollection } from 'astro:content';
export async function GET({ site }: { site: URL }) {
  const posts = await getCollection('posts');
  return new Response(
    `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/blog/', ...posts.map((p) => '/blog/' + p.data.slug + '/')].map((p) => `<url><loc>${new URL(p, site).href}</loc></url>`).join('')}</urlset>`,
    { headers: { 'Content-Type': 'application/xml' } },
  );
}
