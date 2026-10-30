// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://cilly-yllic.github.io',
  // Astro 7 の既定値 'jsx' は改行をまたぐインライン要素間の空白を削除するため、従来の HTML 圧縮を維持する
  compressHTML: true,
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/rss.xml'),
    }),
  ],
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      wrap: true,
    },
  },
});
