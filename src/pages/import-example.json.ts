export function GET() {
  return Response.json(
    {
      posts: [
        {
          sourceUrl: 'https://old.example.com/first-post/',
          title: 'My first imported post',
          slug: 'first-imported-post',
          html: '<h2>Getting started</h2><p>This article will arrive as a draft for review.</p>',
          excerpt: 'An example of the ABS import format.',
          categories: ['Guides'],
          author: 'Example author',
          date: '2024-01-15T10:00:00Z',
          featuredUrl: 'https://old.example.com/uploads/example.jpg',
          alt: 'Describe your featured image',
          seo_title: '',
          seo_description: '',
        },
      ],
    },
    { headers: { 'Content-Disposition': 'attachment; filename="abs-import-example.json"' } },
  );
}
