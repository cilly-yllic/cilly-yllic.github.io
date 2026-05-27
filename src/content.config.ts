import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

export const CATEGORIES = [
  { slug: 'firebase-gcp', title: 'Firebase / GCP' },
  { slug: 'search-opensearch', title: 'Search / OpenSearch' },
  { slug: 'frontend-architecture', title: 'Frontend Architecture' },
  { slug: 'ai-development', title: 'AI Development' },
  { slug: 'engineering-philosophy', title: 'Engineering Philosophy' },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]['slug'];

const categorySlugs = CATEGORIES.map((c) => c.slug) as [CategorySlug, ...CategorySlug[]];

const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notes' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum(categorySlugs),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { notes };
