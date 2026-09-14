# Installation and configuration

## Requirements

- Node.js 24.15 or newer, including npm.
- A writable local disk for SQLite, uploads and releases.
- One running dashboard instance. No separate database service is needed.

## Run locally

```sh
git clone https://github.com/vijaykumarim/astro-blog-studio.git
cd astro-blog-studio
npm ci
npm run setup
npm run admin -- "Your name" "you@example.com"
npm run dev
```

`setup` creates an ignored `.env` with a random authentication secret. The admin command prints a single-use setup link: open it and choose your password. This does not send an email. Keep the link private; it expires after one hour.

Open http://127.0.0.1:4330. Create a post, choose categories, write content, upload a featured image and save. Preview before publishing.

In a second terminal, run:

```sh
npm run preview:site
```

After a successful publish, the example website is available at http://127.0.0.1:4331/blog/.

## Main configuration

`studio.config.mjs` is trusted server configuration: site name, public website URL, initial category names, website project path and build command. `STUDIO_CONFIG` can point to a private override. Never accept build commands from browser input.

`.env` stores the dashboard origin, authentication secret and storage path. Changing the authentication secret invalidates existing authentication material; keep it with your secure backups. Do not commit `.env`.

For an existing Astro website, follow [the integration guide](integration.md). The website must consume the published snapshot rather than mutable drafts.

## Accounts and backups

Administrators invite users from Users. Editors can manage posts and media, but cannot manage users, categories or image settings. Users receive a setup link manually; SMTP delivery is not included. The last active administrator cannot be demoted or deactivated.

Reset an administrator locally if needed:

```sh
npm run admin:reset -- you@example.com
npm run backup
```

Backups are private and contain the SQLite database, immutable draft revisions and media. Keep a separate secure copy of `.env` and move backups off the server. Stop the dashboard before restoring; rebuild the published site afterwards. Do not expose backup folders through the web server.

## Production status

This release is early alpha. The included published-site server is a local development helper. A real installation requires HTTPS, a Node process manager, private persistent storage, a tested deployment adapter, request limits and a restore drill. It is not a PHP application. FTP upload alone is not enough to run the dashboard.
