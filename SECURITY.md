# Security and operational boundaries

This is a local prototype. Do not expose it publicly until production deployment checks in README are complete.

Authentication uses Better Auth and database sessions. HTTP routes expose only sign-in, sign-out, get-session, password reset and password change; signup and reset-link issuance are not public. Our protected API checks membership and administrator permissions independently of what the UI displays. Mutations require the configured origin. Password setup/reset links expire and are single-use.

Articles are converted from sanitised editor HTML into Markdown; executable MDX is not accepted. Uploads are decoded, limited and re-encoded. Private media are served only to authenticated users until referenced in a published snapshot. Filenames and slugs are constrained, and website commands/paths are trusted configuration rather than request parameters.

The publisher runs one job at a time, publishes complete snapshots and keeps old releases on failure. SQLite and private content require filesystem permissions, backups and restore testing. Protect build logs and the deployment service account. No tenant isolation or multi-instance deployment is claimed.

Report vulnerabilities using the repository Security tab → Report a vulnerability when available. If that option is unavailable, contact the maintainer through their public GitHub profile to arrange a private channel; do not post vulnerability details in a public issue. Never include credentials, user data, private articles or active reset links in an issue.
