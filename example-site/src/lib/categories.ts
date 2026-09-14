export const categoriesFor = (data: {
  category: string;
  categories?: string[];
  categoryLinks?: { name: string; slug: string }[];
}) =>
  data.categoryLinks ??
  (data.categories || [data.category]).map((name) => ({
    name,
    slug:
      name
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'category',
  }));
