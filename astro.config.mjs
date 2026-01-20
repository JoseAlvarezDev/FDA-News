// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
    output: 'server',
    site: 'https://fda-news.app',

    adapter: node({
        mode: 'standalone',
    }),

    integrations: [sitemap()],
});