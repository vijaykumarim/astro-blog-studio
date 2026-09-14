import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
process.env.STUDIO_BROWSER_DATA ??= path.resolve('storage/browser-tests', randomUUID());
process.env.STUDIO_DATA = process.env.STUDIO_BROWSER_DATA;
process.env.STUDIO_SECRET = 'local-browser-test-only-secret-not-for-production-0123456789';
process.env.STUDIO_ORIGIN = 'http://127.0.0.1:4340';
// Keep the Playwright-owned server in the foreground in agent environments.
process.env.ASTRO_DEV_BACKGROUND = '1';
export default defineConfig({
  testDir: './tests',
  testMatch: 'browser.spec.ts',
  timeout: 150000,
  workers: 1,
  globalSetup: './tests/global-setup.mjs',
  use: {
    baseURL: 'http://127.0.0.1:4340',
    actionTimeout: 15000,
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  },
});
