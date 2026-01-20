// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
    output: 'static',
    site: 'https://josealvarezdev.github.io',
    base: '/FDA_News',

    integrations: [sitemap()],
});