# Import posts and redirect old URLs

Administrators have **Import posts** and **Redirects** in the sidebar. Editors cannot use their APIs or download server rules.

## WordPress

1. In WordPress, export content as WXR XML. An **All content** export includes attachment records needed to identify featured images; ABS imports only post items with publish, draft, pending or future status. Pages, attachments, private and trashed posts are not imported as articles.
The **Export media with selected content** WordPress plugin can include featured and inline attachment records when exporting only selected posts. Enable its export checkbox.

2. Keep a backup of the original export and keep the original website online until images are imported. WordPress XML refers to images; it does not contain their bytes.
3. In ABS, select the XML file and optionally the uploads folder. Select exports up to 100 MB without a fixed total post-count cap. ABS sends sequential batches of at most 250 posts, reducing the batch size for large articles to stay below the request-byte limit. Keep the tab open. Progress shows each batch; if a request fails, retry the export and existing imports will be skipped. Larger files must be split to keep browser XML/JSON parsing manageable.
4. Preview. Image files are matched by relative path or unique original filename, uploaded through the existing image converter, and linked into the draft. Ambiguous or missing files are reported. With Download images from the original website enabled, unmatched files are fetched from the XML attachment URLs or inline image URLs. Media uploads happen during preview and remain in the media library even if you cancel the import.
5. Review warnings and import ready rows as drafts. The app confirmation is required before creating posts. Review the drafts in the editor, add missing images and image descriptions, and publish when ready.

Title, slug, HTML content, excerpt, category names, author label, original date and supported Yoast/Rank Math SEO fields are imported. WordPress creator labels are retained; no user accounts are created. Slugs must fit ABS's ASCII slug rules. Unsupported markup is sanitized; page-builder shortcodes, embeds, tables and custom blocks may need manual reconstruction. SEO template placeholders are not expanded. Inspect each article before publishing.

Every original source URL is recorded privately. Repeating it skips the existing import; slug conflicts are reported instead of overwriting another article. Deleting an imported draft allows importing that source again. Individual failures are reported and do not undo successful rows. Category creation or image uploads may remain after a failed row. In-batch links are rewritten to their new blog URLs; review links to articles in other batches separately.

## JSON

Download the example file from the import screen. The format is an object with a `posts` array (a plain array is also accepted):

```json
{
  "posts": [{
    "sourceUrl": "https://old.example.com/original-post/",
    "title": "An imported article",
    "slug": "imported-article",
    "html": "<h2>Introduction</h2><p>Your article content.</p>",
    "excerpt": "A short introduction.",
    "categories": ["Guides"],
    "author": "Example author",
    "date": "2024-01-15T10:00:00Z",
    "featuredUrl": "https://old.example.com/uploads/photo.jpg",
    "alt": "Describe the photo",
    "seo_title": "",
    "seo_description": ""
  }]
}
```

`sourceUrl`, `title`, `slug` and `html` are required. Dates use ISO 8601 with a timezone. `featuredUrl` is downloaded when remote downloads are enabled, or matched to a local file. Existing ABS media filenames may be supplied as `image` instead. Original image paths remain in missing-image warnings for review.

## Redirects

Enable **Create 301 redirect mappings** while importing, or add/edit mappings in Redirects. Old paths that already equal the destination need no redirect. Exact ASCII paths are supported. Query-based WordPress URLs such as `?p=123`, encoded paths and external destinations need separate server configuration; the import reports these cases.

Mappings live in the private SQLite database and are included in normal database backups. Downloads are generated from this data:

- **JSON mapping**: `redirects.json`, for a custom integration.
- **Nginx / CloudPanel**: exact `location` rules, to include inside the main website's server block.
- **Apache**: `RedirectMatch` rules, to merge with the website's Apache configuration where mod_alias is supported.
- **Netlify**: `_redirects` syntax for that platform.

Export includes enabled rules only. A `/blog/` destination must match a published ABS post; the manager marks other blog destinations as waiting. Other local destinations must be verified by the site owner. Redirect sources cannot occupy an ABS article URL. Chains, loops, duplicate sources and unsafe configuration characters are rejected.

**Exporting does not activate redirects.** Apply the appropriate file to the main website host, preserve existing unrelated rules, validate/reload that server's configuration and verify old URLs return the intended HTTP status and destination. Nginx does not read `.htaccess`. Static Astro HTML redirects alone are not server HTTP redirects. If changing domains, the old domain must also remain configured to serve its redirects.

Changes or deletions in ABS affect future exports only. Already deployed rules are unchanged until you replace the managed server rules. Publishing/unpublishing changes which blog targets are eligible, so export again after the final publication state is ready. No CloudPanel credentials, automatic server reload or production deployment are added by this feature.

## Automatic image downloads
Downloads are sequential, with a 20-second timeout, three redirects maximum and the upload size/format settings applied. Only public HTTP(S) IPv4 hosts on standard ports are supported; private networks, credentials in URLs and unsupported images are rejected. Successfully imported URLs are cached for retries. Click Preview again to retry failed downloads before importing drafts; existing imported posts are skipped. Files are saved in the media library during preview. Inline image sources and featured images are replaced with local copies. GIF, SVG, video and custom gallery shortcodes require manual handling.

## Metadata and publishing readiness
ABS keeps supplied excerpts and WordPress attachment alt text. If the excerpt is empty, it creates a short excerpt from the existing article text. If attachment alt text is empty, it uses the existing attachment title; review that text for accessibility before publishing. Existing posts are not overwritten on repeat imports. Bulk publishing validates all selected posts in one pass and displays a persistent list with edit links for incomplete posts. The old 100-post limit is removed; one selection queues one build. Nothing in the import publishes posts automatically.
