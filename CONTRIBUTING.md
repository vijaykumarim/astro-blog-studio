# Contributing

Thank you for helping improve Astro Blog Studio. This is an independent community project in early alpha.

## Development

Use Node 24.15 or later. Fork and clone the repository, run `npm ci`, then `npm run setup`. Create your local administrator with `npm run admin -- "Your name" "you@example.com"`, and run `npm run dev`.

The dashboard is in `src/`. `example-site/` demonstrates the Astro content integration. SQLite, media, revision snapshots and test output live in ignored folders. Never commit `.env`, credentials, exported databases, build logs, reset links or real customer content.

Before a pull request, run:

```sh
npm run check
npm test
npm run build
npx playwright install chromium
npx playwright test
```

Browser tests use temporary data and port 4340. Keep your ordinary dashboard on 4330. Describe the problem, the resulting behavior and how you checked it. Keep changes focused; discuss larger architecture changes in an issue first. By submitting code, you agree that your contribution is provided under this project's MIT licence.

## Issues

Include reproduction steps, expected/actual behavior, Node version and operating system. Use example content and remove personal data from screenshots. Report vulnerabilities privately as described in SECURITY.md.
