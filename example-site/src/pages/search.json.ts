import { getCollection } from 'astro:content';
export async function GET() {
  return Response.json(
    (await getCollection('posts')).map(({ data: p }) => ({
      title: p.title,
      href: '/blog/' + p.slug + '/',
      type: 'Blog',
      keywords: p.excerpt + ' ' + p.category,
    })),
  );
}
