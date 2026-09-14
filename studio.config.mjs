// Trusted server configuration. Never accept paths or commands from browser requests.
export default {
  name: 'Blog Studio',
  siteName: 'Your website',
  siteUrl: 'http://127.0.0.1:4331',
  categories: ['Guides', 'News', 'Stories'],
  publish: {
    // Default: build the included Astro example and activate a local release.
    project: './example-site',
    command: process.execPath,
    args: ['../node_modules/astro/bin/astro.mjs', 'build'],
    timeoutMs: 180000,
  },
};
