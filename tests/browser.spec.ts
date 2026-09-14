import path from 'node:path';
import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
test('editor, publish, access boundaries, images and responsive dashboard', async ({
  page,
  request,
  browser,
}) => {
  const errors: string[] = [];
  const nativeDialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    nativeDialogs.push(dialog.type());
    await dialog.dismiss();
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const { invite, initAuth } = await import('../src/lib/auth.mjs');
  await initAuth();
  const password = randomBytes(20).toString('base64url');
  const admin = await invite({
    name: 'Browser test admin',
    email: 'admin-' + Date.now() + '@example.test',
    role: 'admin',
  });
  await page.goto(admin.url);
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page).toHaveURL(/\/login$/);
  const { db } = await import('../src/lib/db.mjs');
  const user = db.prepare('SELECT email FROM user WHERE id=?').get(admin.id) as { email: string };
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /^Sign in/ }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4340/');
  await expect(page.getByRole('heading', { name: 'A home for your stories.' })).toBeVisible();
  await page.goto('/users');
  await expect(page.getByRole('button', { name: 'Make editor', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Deactivate', exact: true })).toBeDisabled();
  expect(
    (
      await page.request.patch('/api/users/' + admin.id, {
        headers: { origin: 'http://127.0.0.1:4340' },
        data: { role: 'editor' },
      })
    ).status(),
  ).toBe(400);
  await page.goto('/');
  expect((await request.get('/api/posts')).status()).toBe(401);
  expect(
    (
      await page.request.post('/api/auth/sign-up/email', {
        headers: { origin: 'http://127.0.0.1:4340' },
        data: { name: 'Bad', email: 'bad@example.test', password },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.post('/api/posts', { headers: { origin: 'https://wrong.test' }, data: {} })
    ).status(),
  ).toBe(403);
  await page.goto('/settings');
  await page.getByLabel('Maximum width (px)').fill('1200');
  await page.getByRole('combobox', { name: 'Image ratio', exact: true }).selectOption('3:2');
  await page.locator('input[name="quality"]').fill('78');
  await expect(page.locator('#quality-value')).toHaveText('78');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.locator('#settings-status')).toContainText('Settings saved');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/settings-mobile.png', fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.goto('/posts/new');
  await expect(page.locator('[data-slug-preview]')).toHaveText('your-post');
  await page.getByRole('checkbox', { name: 'News', exact: true }).check();
  await page.getByLabel('Post title').fill('A clearer way to publish');
  await page
    .getByLabel('Excerpt', { exact: true })
    .fill('A local demonstration of writing and publishing with Blog Studio.');
  await page
    .getByRole('textbox', { name: 'Article body' })
    .fill(
      'A good article starts with a useful idea. This is a local demonstration of a complete publishing workflow.',
    );
  const sharp = (await import('sharp')).default;
  const buffer = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: '#40745c' },
  })
    .png()
    .toBuffer();
  await page
    .locator('#featured-upload')
    .setInputFiles({ name: 'feature.png', mimeType: 'image/png', buffer });
  await expect(page.locator('#featured-preview')).toBeVisible();
  await page.getByLabel('Image description').fill('Green example image');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Preview' })).toBeVisible();
  const postId = page.url().split('/').at(-1)!;
  const saved = await (await page.request.get('/api/posts/' + postId)).json();
  expect(saved.categories).toEqual(['Guides', 'News']);
  const clash = await page.request.patch('/api/posts/' + postId, {
    headers: { origin: 'http://127.0.0.1:4340' },
    data: { ...saved, version: 0 },
  });
  expect(clash.status()).toBe(409);
  const preview = await page.request.get('/preview/' + postId);
  expect(await preview.text()).toContain('A clearer way to publish');
  const anon = await request.get('/preview/' + postId, { maxRedirects: 0 });
  expect(anon.status()).toBe(302);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/editor-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Publish', exact: false }).click();
  await expect(page).toHaveURL(/\/publishing$/);
  await expect
    .poll(
      async () => {
        const jobs = await (await page.request.get('/api/jobs')).json();
        return jobs[0].status;
      },
      { timeout: 90000 },
    )
    .toBe('live');
  await page.goto('/');
  await page.locator('[data-post-category]').selectOption('News');
  await expect(page.locator('[data-post-row]:visible')).toHaveCount(1);
  await page.locator('[data-select-posts]').check();
  await expect(page.locator('[data-selection-count]')).toHaveText('1 selected');
  await page.locator('[data-post-category]').selectOption('');
  await expect(page.locator('[data-selection-count]')).toHaveText('0 selected');
  await page.locator('[data-select-posts]').check();
  await page.locator('[data-bulk-apply]').click();
  await expect(page.locator('#app-dialog-title')).toHaveText('Publish 1 posts?');
  await page.locator('[data-app-cancel]').click();
  await page.screenshot({ path: 'test-results/posts-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/posts-mobile.png', fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.goto('/posts/' + postId);
  await expect(page.getByRole('textbox', { name: 'Article body' })).toContainText(
    'A good article starts',
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: 'test-results/editor-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/users');
  await page.getByRole('button', { name: 'Invite user' }).click();
  await page.getByLabel('Full name').fill('Test editor');
  await page.getByLabel('Email', { exact: true }).fill('editor-' + Date.now() + '@example.test');
  await page.getByRole('button', { name: 'Create invitation' }).click();
  await expect(page.locator('#link-dialog')).toBeVisible();
  const link = await page.locator('#setup-link').inputValue();
  const editorContext = await browser.newContext();
  const editorPage = await editorContext.newPage();
  await editorPage.goto(link);
  await editorPage.getByLabel('New password', { exact: true }).fill(password);
  await editorPage.getByLabel('Confirm password').fill(password);
  await editorPage.getByRole('button', { name: 'Set password' }).click();
  await expect(editorPage).toHaveURL(/\/login$/);
  const editor = db
    .prepare(
      "SELECT u.id,u.email FROM user u JOIN members m ON u.id=m.user_id WHERE m.role='editor' ORDER BY u.createdAt DESC",
    )
    .get() as { id: string; email: string };
  await editorPage.getByLabel('Email', { exact: true }).fill(editor.email);
  await editorPage.getByLabel('Password', { exact: true }).fill(password);
  await editorPage.getByRole('button', { name: /^Sign in/ }).click();
  await expect(editorPage).toHaveURL('http://127.0.0.1:4340/');
  expect(
    (
      await editorPage.request.post('/api/users', {
        headers: { origin: 'http://127.0.0.1:4340' },
        data: { name: 'Escalation', email: 'fail@example.test' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await editorPage.request.post('/api/categories', {
        headers: { origin: 'http://127.0.0.1:4340' },
        data: { name: 'Not allowed' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await editorPage.request.patch('/api/settings/images', {
        headers: { origin: 'http://127.0.0.1:4340' },
        data: {},
      })
    ).status(),
  ).toBe(403);
  for (const route of ['imports/preview', 'imports', 'redirects']) {
    expect(
      (
        await editorPage.request.post('/api/' + route, {
          headers: { origin: 'http://127.0.0.1:4340' },
          data: { posts: [] },
        })
      ).status(),
    ).toBe(403);
  }
  expect((await editorPage.request.get('/api/redirects/export/json')).status()).toBe(403);

  await page.goto('/users');
  await page.locator('[data-toggle-user="' + editor.id + '"]').click();
  await expect(page.locator('#app-dialog')).toBeVisible();
  await page.screenshot({ path: 'test-results/app-confirmation.png' });
  await page.getByRole('button', { name: 'Apply change', exact: true }).click();
  await expect(page.locator('[data-toggle-user="' + editor.id + '"]')).toHaveText('Activate');
  expect((await editorPage.request.get('/api/posts')).status()).toBe(401);
  await editorContext.close();
  await page.goto('/categories');
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  await page.getByLabel('Category name').fill('Editorial');
  await page.getByRole('button', { name: 'Save category' }).click();
  await expect(page.getByRole('heading', { name: 'Editorial', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Rename Editorial', exact: true }).click();
  await page.getByLabel('Category name').fill('Features');
  await page.getByRole('button', { name: 'Save category' }).click();
  await expect(page.getByRole('heading', { name: 'Features', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Features', exact: true }).click();
  await page.getByRole('button', { name: 'Delete category', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Features', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Delete Guides', exact: true }).click();
  await expect(page.getByLabel('Move posts to')).toBeVisible();
  await page.getByLabel('Move posts to').selectOption({ label: 'News' });
  await page.getByRole('button', { name: 'Delete category', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Guides', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/categories-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/categories-mobile.png', fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.goto('/posts/' + postId);
  await expect(page.getByRole('checkbox', { name: 'News', exact: true })).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Article body' })).toContainText(
    'A good article starts',
  );
  expect(errors).toEqual([]);
  await page
    .locator('#inline-upload')
    .setInputFiles({ name: 'inline.png', mimeType: 'image/png', buffer });
  await expect(page.locator('#app-dialog-title')).toHaveText('Add an article image');
  await page.locator('[data-app-cancel]').click();
  await page.getByRole('button', { name: 'Unpublish', exact: true }).click();
  await expect(page.locator('#app-dialog-title')).toHaveText('Unpublish article?');
  await page.locator('[data-app-cancel]').click();
  await page.getByRole('button', { name: 'Delete draft', exact: true }).click();
  await expect(page.locator('#app-dialog-title')).toHaveText('Delete draft?');
  await page.keyboard.press('Escape');
  await page
    .getByRole('textbox', { name: 'Article body' })
    .fill('Unsaved test text to recover after reload.');
  await page.reload();
  await expect(page.locator('#app-dialog-title')).toHaveText('Restore unsaved changes?');
  await page.getByRole('button', { name: 'Restore changes', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Article body' })).toContainText(
    'Unsaved test text',
  );
  await page.getByRole('button', { name: 'Menu ☰', exact: true }).click();
  await page.getByRole('link', { name: 'Media library', exact: false }).click();
  await expect(page.locator('#app-dialog-title')).toHaveText('Leave without saving?');
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page).toHaveURL(/\/media$/);
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(
    await page
      .locator('.media-grid figure')
      .first()
      .evaluate((el) => el.getBoundingClientRect().width),
  ).toBeLessThan(230);
  await page.screenshot({ path: 'test-results/media-compact.png' });
  const imageButton=page.locator('[data-media-details]').first();
  await expect(page.locator('.media-grid figcaption').first()).toContainText('px');
  await imageButton.click();
  await expect(page.getByRole('dialog',{name:'Image details'})).toBeVisible();
  await expect(page.locator('[data-detail="dimensions"]')).toContainText('×');
  await expect(page.locator('#media-url')).toHaveValue(/http:\/\/127\.0\.0\.1:4340\/media\//);
  await expect.poll(async()=>Math.round(await page.locator('#media-details').evaluate(el=>el.getBoundingClientRect().right))).toBe(1440);
  await page.screenshot({path:'test-results/media-drawer-desktop.png',fullPage:true});
  await page.keyboard.press('Escape');
  await expect(imageButton).toBeFocused();
  await page.setViewportSize({width:390,height:844});
  await imageButton.click();
  expect(await page.locator('#media-details').evaluate(el=>el.getBoundingClientRect().width)).toBeLessThanOrEqual(390);
  await expect.poll(async()=>Math.round(await page.locator('#media-details').evaluate(el=>el.getBoundingClientRect().left))).toBe(0);
  await page.screenshot({path:'test-results/media-drawer-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Close image details',exact:true}).click();
  await page.setViewportSize({width:1440,height:1000});

  expect(
    await page
      .locator('.media-grid img')
      .first()
      .evaluate((el) => el.getBoundingClientRect().height),
  ).toBeLessThan(150);
  await page.goto('/posts/' + postId);
  expect(nativeDialogs).toEqual([]);

  await page.goto('/media');
  await page.locator('[data-media-details]').first().click();
  await page.locator('#media-details [data-media-delete]').click();
  await page.locator('#app-dialog').getByRole('button',{name:'Delete image',exact:true}).click();
  await expect(page.locator('[data-media-status]')).toContainText('used by');
  await page.keyboard.press('Escape');
  const unusedResponse=await page.request.post('/api/media',{headers:{Origin:'http://127.0.0.1:4340'},multipart:{file:{name:'unused.png',mimeType:'image/png',buffer}}});
  expect(unusedResponse.ok()).toBeTruthy();
  const unused=await unusedResponse.json();
  await page.reload();
  const unusedButton=page.locator('[data-media-details]').filter({has:page.locator('img[src="/media/'+unused.filename+'"]')});
  await unusedButton.click();
  await page.locator('[data-media-delete]').click();
  await page.locator('#app-dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.locator('#media-details')).toBeVisible();
  await page.locator('[data-media-delete]').click();
  await page.locator('#app-dialog').getByRole('button',{name:'Delete image',exact:true}).click();
  await expect(page.locator('img[src="/media/'+unused.filename+'"]')).toHaveCount(0);
  expect(nativeDialogs).toEqual([]);
  await page.goto('/imports');
  const xml = `<?xml version="1.0"?><rss xmlns:wp="http://wordpress.org/export/1.2/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><wp:wxr_version>1.2</wp:wxr_version><item><title>Imported browser story</title><link>https://old.example.com/browser-story/</link><wp:post_type>post</wp:post_type><wp:status>publish</wp:status><wp:post_name>browser-import</wp:post_name><wp:post_date_gmt>2021-01-01 12:00:00</wp:post_date_gmt><wp:postmeta><wp:meta_key>_thumbnail_id</wp:meta_key><wp:meta_value>99</wp:meta_value></wp:postmeta><content:encoded><![CDATA[<h2>Imported heading</h2><p>Original imported article content.</p><img src="https://old.example.com/uploads/import-image.png" alt="Imported illustration" />]]></content:encoded></item><item><wp:post_type>attachment</wp:post_type><wp:post_id>99</wp:post_id><wp:postmeta><wp:meta_key>_wp_attachment_image_alt</wp:meta_key><wp:meta_value>Original WordPress image description</wp:meta_value></wp:postmeta><wp:attachment_url>https://old.example.com/uploads/import-image.png</wp:attachment_url></item></channel></rss>`;
  await page
    .locator('#import-file')
    .setInputFiles({ name: 'wordpress.xml', mimeType: 'text/xml', buffer: Buffer.from(xml) });
  const importMedia = path.join(process.env.STUDIO_BROWSER_DATA!, 'import-media');
  mkdirSync(importMedia, { recursive: true });
  writeFileSync(path.join(importMedia, 'import-image.png'), buffer);
  await page.locator('#import-media').setInputFiles(importMedia);
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(page.locator('#import-rows')).toContainText('ready: Imported browser story');
  await page.screenshot({ path: 'test-results/imports-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Import ready posts as drafts', exact: true }).click();
  await page.getByRole('button', { name: 'Import drafts', exact: true }).click();
  await expect(page.locator('#import-rows')).toContainText('imported: Imported browser story');
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(page.locator('#import-rows')).toContainText('skip: Imported browser story');
  const importedPosts = await (await page.request.get('/api/posts')).json();
  const imported = importedPosts.find((p: any) => p.slug === 'browser-import');
  expect(imported.image).toMatch(/\.webp$/);
  expect(imported.alt).toBe('Original WordPress image description');
  expect(imported.excerpt).toContain('Original imported article content.');
  const importedDetail = await (await page.request.get('/api/posts/' + imported.id)).json();
  expect(importedDetail.html).toContain('/media/');
  expect(importedDetail.html).not.toContain('old.example.com/uploads');
  await page.goto('/imports');
  let remoteCalls = 0;
  await page.route('**/api/imports/images', async route => {
    remoteCalls++;
    expect(route.request().postDataJSON().url).toBe('https://old.example.com/uploads/import-image.png');
    await route.fulfill({json:{filename:imported.image}});
  });
  await page.locator('#import-file').setInputFiles({name:'plugin.xml',mimeType:'text/xml',buffer:Buffer.from(xml.replaceAll('browser-story','remote-story').replaceAll('browser-import','remote-import'))});
  await page.getByRole('button',{name:'Preview import',exact:true}).click();
  await expect(page.locator('#import-rows')).toContainText('ready: Imported browser story');
  expect(remoteCalls).toBe(1);
  await page.getByRole('button',{name:'Import ready posts as drafts',exact:true}).click();
  await page.getByRole('button',{name:'Import drafts',exact:true}).click();
  await expect(page.locator('#import-rows')).toContainText('imported: Imported browser story');
  await page.unroute('**/api/imports/images');
  const rejectedImage=await page.request.post('/api/imports/images',{headers:{Origin:'http://127.0.0.1:4340'},data:{url:'http://127.0.0.1/private.png'}});
  expect(rejectedImage.status()).toBe(400);
  expect((await rejectedImage.json()).error).toContain('public');
  const remotePosts = await (await page.request.get('/api/posts')).json();
  const remote = remotePosts.find((p:any)=>p.slug==='remote-import');
  expect(remote.image).toBe(imported.image);
  const remoteDetail=await (await page.request.get('/api/posts/'+remote.id)).json();
  expect(remoteDetail.html).toContain('/media/'+imported.image);
  expect(remoteDetail.html).not.toContain('old.example.com/uploads');
  await page.goto('/redirects');
  await expect(page.locator('.migration-row').filter({hasText:'/browser-story/'})).toBeVisible();
  await page.getByLabel('Old path').fill('/another-old/');
  await page.getByLabel('New path').fill('/about/');
  await page.getByRole('button', { name: 'Save redirect', exact: true }).click();
  await expect(page.locator('.migration-row').filter({ hasText: '/another-old/' })).toBeVisible();
  const mapping = await page.request.get('/api/redirects/export/json');
  expect(await mapping.json()).toEqual([{ from: '/another-old/', to: '/about/', status: 301 }]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: 'test-results/redirects-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/posts/' + postId);

  const favicon = await request.get('/favicon.svg');
  expect(favicon.status()).toBe(200);
  expect(favicon.headers()['content-type']).toContain('image/svg+xml');
  expect(await favicon.text()).toContain('<svg');
  const batchSizes:number[]=[];
  page.on('request',req=>{if(new URL(req.url()).pathname==='/api/imports'&&req.method()==='POST')batchSizes.push(req.postDataJSON().posts.length);});
  await page.goto('/imports');
  const manyPosts=Array.from({length:251},(_,i)=>({sourceUrl:`https://old.example.com/batch-${i}/`,title:`Batch story ${i}`,slug:`batch-story-${i}`,html:'<p>Imported batch article for review.</p>'}));
  await page.locator('#import-file').setInputFiles({name:'large-export.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({posts:manyPosts}))});
  await page.getByRole('button',{name:'Preview import',exact:true}).click();
  await expect(page.locator('#import-progress')).toContainText('251 ready');
  await page.getByRole('button',{name:'Import ready posts as drafts',exact:true}).click();
  await page.getByRole('button',{name:'Import drafts',exact:true}).click();
  await expect(page.locator('#import-progress')).toContainText('251 drafts imported');
  expect(batchSizes).toEqual([250,1]);
  await page.goto('/');
  await page.locator('[data-select-posts]').check();
  await page.locator('[data-bulk-apply]').click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.locator('#bulk-errors')).toBeVisible();
  await expect(page.locator('#bulk-errors')).toContainText('Featured image');
  await expect(page.locator('#bulk-errors a').first()).toHaveAttribute('href',/\/posts\//);
  await expect(page.locator('#bulk-errors')).not.toContainText('1–100');
  await page.goto('/posts/'+postId);

  // An unavailable editor module must leave saved content visible and prevent a blank save.
  await page.route('**/src/scripts/editor.ts*', (route) => route.abort());
  await page.reload();
  await expect(page.locator('#editor-load-status')).toContainText('could not load');
  await expect(page.locator('#rich-editor')).toContainText('A good article starts');
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  await page.unroute('**/src/scripts/editor.ts*');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Article body' })).toContainText(
    'A good article starts',
  );
  // Review screenshots and test DB stay in ignored folders, never in the source release.
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    'test-results/browser-proof.json',
    JSON.stringify({ passed: true, postId }, null, 2),
  );
});
