export interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  categories?: string[];
  author: string;
  image: string;
  alt: string;
  seo_title: string;
  seo_description: string;
  version: number;
  published_version: number | null;
  created_at: string;
  updated_at: string;
  html?: string;
}
export interface Member {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor';
  status: 'active' | 'invited' | 'disabled';
}
export interface Job {
  id: string;
  title?: string;
  action: string;
  status: string;
  created_at: string;
  finished_at: string | null;
  error: string | null;
}
export interface Media {
  id: string;
  filename: string;
  alt: string;
  created_at: string;
}
