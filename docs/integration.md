# Connect your Astro website

The dashboard and your public website are separate applications. The dashboard runs on Node with SQLite; the public website can remain static Astro HTML.

## Publishing flow

1. Saving a post creates a new immutable Markdown revision.
2. Publishing takes a snapshot of the selected published revisions and their images.
3. The configured Astro project builds from that snapshot.
4. ABS verifies the expected article pages exist.
5. A complete release is activated through a SQLite pointer swap. Failed builds leave the previous release active.

Drafts remain private. Unpublishing rebuilds without the selected posts. Bulk publishing activates all selected revisions in one release.

## Build contract

Use `example-site/src/content.config.ts` and `example-site/astro.config.mjs` as working examples. Configure `publish.project`, `publish.command` and `publish.args` in trusted `studio.config.mjs`.

| Variable | Website responsibility |
| --- | --- |
| `STUDIO_CONTENT_DIR` | Load the snapshot Markdown files into a Content Collection. |
| `STUDIO_MEDIA_DIR` | Copy referenced images to the build's `/media/` directory. |
| `STUDIO_BUILD_DIR` | Write the complete site into this isolated output directory. |
| `STUDIO_CACHE_DIR` | Use this isolated cache so parallel dev tooling stays separate. |
| `STUDIO_SITE_URL` | Use the configured public site URL where needed. |

Clear the collection store before loading each snapshot so unpublished articles cannot remain in stale output. The build must include `/blog/` and `/blog/{slug}/`. The example also implements category archives, RSS, sitemap and a search JSON endpoint.

Markdown files use JSON-formatted YAML frontmatter. Metadata includes title, slug, excerpt, author, image, alt, dates, SEO fields, a compatibility primary `category`, and optional `categories` and `categoryLinks` (`name` and stable `slug`). Do not execute arbitrary MDX.

## Local development bridge

An optional `publish.manifest` setting points to a private JSON file. After successful activation, ABS writes `{release, content, media}` to it. A local site can watch this file to refresh its published content. The manifest contains local paths; never serve it publicly or commit it. It is not a remote deployment adapter.

The included preview uses the example article template. For a differently styled website, implement a matching authenticated preview before describing previews as identical to the final site.

## Deployment

Keep the website checkout on an approved version: a post publication should not accidentally deploy unfinished website changes. Production activation, hosting-specific permissions, redirects and rollback controls require a deployment adapter. This alpha does not configure them automatically.
