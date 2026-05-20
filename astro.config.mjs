import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://alpakay.dev',
  base: '/',
  build: {
    inlineStylesheets: 'auto',
  },
  compressHTML: true,
});
