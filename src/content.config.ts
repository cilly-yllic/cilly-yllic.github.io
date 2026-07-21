import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import type { Locale } from './i18n';

export const CATEGORIES = [
  { slug: 'firebase-gcp', title: 'Firebase / GCP', titleEn: 'Firebase / GCP' },
  { slug: 'ai-agents', title: 'AI エージェント', titleEn: 'AI Agents' },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]['slug'];

export function categoryTitle(slug: CategorySlug | string, locale: Locale = 'ja'): string {
  const cat = CATEGORIES.find((c) => c.slug === slug);
  if (!cat) return String(slug);
  return locale === 'en' ? cat.titleEn : cat.title;
}

const categorySlugs = CATEGORIES.map((c) => c.slug) as [CategorySlug, ...CategorySlug[]];

const noteSchema = z.object({
  title: z.string(),
  description: z.string(),
  category: z.enum(categorySlugs),
  publishedAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
  draft: z.boolean().default(false),
});

const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notes' }),
  schema: noteSchema,
});

// 英語版ノート。id (カテゴリ/スラッグ) を日本語版と一致させると、
// 記事ページ間の言語切り替えリンク (hreflang / プルダウン) が自動で張られる。
const notesEn = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notes-en' }),
  schema: noteSchema,
});

export const collections = { notes, notesEn };
