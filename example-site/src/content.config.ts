import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const source = glob({
  pattern: '*.md',
  base: pathToFileURL(path.resolve(process.env.STUDIO_CONTENT_DIR || './content') + path.sep),
});
const posts = defineCollection({
  loader: {
    ...source,
    async load(context) {
      context.store.clear();
      await source.load(context);
    },
  },
  schema: z.object({
    id: z.string(),
    title: z.string(),
    slug: z.string(),
    excerpt: z.string(),
    category: z.string(),
    categories: z.array(z.string()).optional(),
    categoryLinks: z.array(z.object({ name: z.string(), slug: z.string() })).optional(),
    author: z.string(),
    image: z.string(),
    alt: z.string(),
    seo_title: z.string(),
    seo_description: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  }),
});
export const collections = { posts };
