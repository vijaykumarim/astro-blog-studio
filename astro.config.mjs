import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  devToolbar: { enabled: false },
  vite: {
    // Checks/tests must not replace the dependency cache used by the running dashboard.
    cacheDir: process.env.STUDIO_BROWSER_DATA
      ? `${process.env.STUDIO_BROWSER_DATA}/vite`
      : process.env.STUDIO_VITE_CACHE || 'node_modules/.vite-studio-tools',
    optimizeDeps: {
      include: [
        '@tiptap/core',
        '@tiptap/starter-kit',
        '@tiptap/extension-image',
        'better-auth/client',
      ],
    },
    server: {
      watch: { ignored: ['**/storage/**', '**/example-site/dist/**', '**/example-site/.astro/**'] },
    },
  },
  server: { host: '127.0.0.1', port: 4330 },
});
