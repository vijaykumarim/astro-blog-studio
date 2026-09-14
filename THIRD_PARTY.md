# Third-party software

The dashboard is self-hosted; no paid CMS/auth service is required. It uses open-source packages, which remain dependencies to update and test.

- Astro and its Node adapter — MIT
- Better Auth — MIT
- Tiptap open-source editor packages — MIT (no Tiptap Cloud or paid extensions)
- SQLite — public domain; Node's built-in driver is part of Node.js
- Marked and Turndown — MIT
- sanitize-html — MIT
- Sharp — Apache-2.0; its native dependencies, including libvips, have their own notices
- Zod, TypeScript, Playwright and Astro Check — their respective upstream licences

Exact versions are locked in `package-lock.json`. Installed packages include their upstream licence files. Before distributing a bundled binary/container, preserve those notices and review native dependency obligations. The project MIT licence covers original dashboard code, not a relicensing of dependencies or website content.
