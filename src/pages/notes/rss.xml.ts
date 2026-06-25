import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';

export async function GET(context: APIContext) {
  const notes = await getCollection('notes', ({ data }) => !data.draft);
  const sorted = notes.sort((a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime());

  return rss({
    title: 'cilly — Architecture Notes',
    description: '技術思想・設計思想に関する記事の RSS フィード。',
    site: context.site!,
    items: sorted.map((note) => ({
      title: note.data.title,
      description: note.data.description,
      link: `/notes/${note.id}/`,
      pubDate: note.data.publishedAt,
      categories: [note.data.category],
    })),
    customData: '<language>ja</language>',
  });
}
