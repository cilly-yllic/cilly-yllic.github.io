import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';

export async function GET(context: APIContext) {
  const notes = await getCollection('notesEn', ({ data }) => !data.draft);
  const sorted = notes.sort((a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime());

  return rss({
    title: 'cilly — Architecture Notes (EN)',
    description: 'RSS feed of articles on engineering and design philosophy.',
    site: context.site!,
    items: sorted.map((note) => ({
      title: note.data.title,
      description: note.data.description,
      link: `/en/notes/${note.id}/`,
      pubDate: note.data.publishedAt,
      categories: [note.data.category],
    })),
    customData: '<language>en</language>',
  });
}
