import { importRemoteImage } from '../../lib/remote-images.mjs';
import { deleteMedia } from '../../lib/media.mjs';
import { inspectImport, runImport } from '../../lib/imports.mjs';
import {
  listRedirects,
  saveRedirect,
  deleteRedirect,
  exportRedirects,
} from '../../lib/redirects.mjs';
import { imageSettings, saveImageSettings, convertImage } from '../../lib/image-settings.mjs';
import type { APIRoute } from 'astro';
import { db, audit, postCategories } from '../../lib/db.mjs';
import { getPost, savePost, deletePost, Conflict, deletePosts } from '../../lib/content.mjs';
import { invite, changeMember, resetLink } from '../../lib/auth.mjs';
import { queuePublish, PublishValidation } from '../../lib/publish.mjs';
import {
  listCategories,
  createCategory,
  renameCategory,
  deleteCategory,
} from '../../lib/categories.mjs';
async function limitedRequest(request: Request, max: number) {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader)
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > max) {
        await reader.cancel();
        throw new Error('Request is too large. Check the image upload limit in Settings.');
      }
      chunks.push(value);
    }
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: Buffer.concat(chunks),
  });
}
export const ALL: APIRoute = async ({ request, params, locals }) => {
  const account = locals.account;
  if (!account) return Response.json({ error: 'Please sign in.' }, { status: 401 });
  const route = params.path ?? '',
    method = request.method,
    actor = account.user.id;
  try {
    const migrationRoute =
      route === 'imports' ||
      route.startsWith('imports/') ||
      route === 'redirects' ||
      route.startsWith('redirects/');
    if (migrationRoute && account.role !== 'admin')
      return Response.json({ error: 'Administrator access required.' }, { status: 403 });
    if (method === 'GET' && route === 'redirects') return Response.json(listRedirects());
    if (method === 'GET' && route.startsWith('redirects/export/')) {
      const format = route.split('/').at(-1)!;
      const names: Record<string, string> = {
        json: 'redirects.json',
        nginx: 'redirects.nginx.conf',
        apache: 'redirects.apache.conf',
        netlify: '_redirects',
      };
      if (!names[format]) return new Response('Not found', { status: 404 });
      return new Response(exportRedirects(format), {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${names[format]}"`,
        },
      });
    }
    if (method === 'GET') {
      if (route === 'categories') return Response.json(listCategories());
      if (route === 'settings/images') return Response.json(imageSettings());
      if (route === 'posts')
        return Response.json(
          db
            .prepare('SELECT * FROM posts ORDER BY updated_at DESC')
            .all()
            .map((p) => ({ ...p, categories: postCategories(p) })),
        );
      if (route.startsWith('posts/')) {
        const post = getPost(route.slice(6));
        return Response.json(post ?? { error: 'Post not found.' }, { status: post ? 200 : 404 });
      }
      if (route === 'jobs')
        return Response.json(
          db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 30').all(),
        );
    }
    if (!['POST', 'PATCH', 'DELETE'].includes(method))
      return new Response('Not found', { status: 404 });
    const mediaMatch = route.match(/^media\/([a-f0-9-]{36})$/);
    if (mediaMatch && method === 'DELETE') return Response.json(deleteMedia(mediaMatch[1], actor));
    if (route === 'media' && method === 'POST') {
      const bounded = await limitedRequest(
        request,
        imageSettings().maxUploadMB * 1024 * 1024 + 65536,
      );
      const form = await bounded.formData();
      const file = form.get('file');
      if (!(file instanceof File)) throw new Error('Choose an image.');
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await convertImage(buffer);
      audit(actor, 'image-uploaded', result.filename);
      return Response.json(result);
    }

    const bounded = await limitedRequest(
      request,
      route.startsWith('imports') ? 10 * 1024 * 1024 : 1024 * 1024,
    );
    const body = await bounded.json();
    if (route === 'imports/images' && method === 'POST') {
      const result = await importRemoteImage(body.url);
      audit(actor, 'image-imported', result.filename);
      return Response.json(result);
    }
    if (route === 'imports/preview' && method === 'POST')
      return Response.json({ rows: inspectImport(body) });
    if (route === 'imports' && method === 'POST') return Response.json(runImport(body, actor));
    if (route === 'redirects' && method === 'POST')
      return Response.json(saveRedirect(null, body, actor));
    const redirectMatch = route.match(/^redirects\/([a-f0-9-]{36})$/);
    if (redirectMatch && method === 'PATCH')
      return Response.json(saveRedirect(redirectMatch[1], body, actor));
    if (redirectMatch && method === 'DELETE') {
      deleteRedirect(redirectMatch[1], actor);
      return Response.json({ ok: true });
    }
    if (route === 'settings/images' && method === 'PATCH') {
      if (account.role !== 'admin')
        return Response.json({ error: 'Administrator access required.' }, { status: 403 });
      return Response.json(saveImageSettings(body, actor));
    }
    if (route === 'posts/bulk' && method === 'POST') {
      if (
        !Array.isArray(body.ids) ||
        !body.ids.length ||
        body.ids.some((id: unknown) => typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id))
      )
        throw new Error('Select at least one post.');
      if (body.action === 'delete') {
        deletePosts(body.ids, actor);
        return Response.json({ ok: true });
      }
      if (!['publish', 'unpublish'].includes(body.action))
        throw new Error('Choose a valid action.');
      return Response.json({ job: queuePublish(body.ids, body.action, actor) });
    }

    if (route === 'categories' || route.startsWith('categories/')) {
      if (account.role !== 'admin')
        return Response.json({ error: 'Administrator access required.' }, { status: 403 });
      if (route === 'categories' && method === 'POST')
        return Response.json(createCategory(body.name, actor));
      const match = route.match(/^categories\/([a-f0-9-]{36})$/);
      if (match && method === 'PATCH')
        return Response.json(renameCategory(match[1], body.name, actor));
      if (match && method === 'DELETE')
        return Response.json(deleteCategory(match[1], body.replacementId, actor));
      return new Response('Not found', { status: 404 });
    }
    if (route === 'posts' && method === 'POST') return Response.json(savePost(null, body, actor));
    const postRoute = route.match(/^posts\/([a-f0-9-]{36})(?:\/(publish|unpublish))?$/);
    if (postRoute) {
      const [, id, action] = postRoute;
      if (action && method === 'POST')
        return Response.json({ job: queuePublish(id, action, actor) });
      if (method === 'PATCH') return Response.json(savePost(id, body, actor));
      if (method === 'DELETE') {
        deletePost(id, actor);
        return Response.json({ ok: true });
      }
    }
    if (route === 'rebuild' && method === 'POST')
      return Response.json({ job: queuePublish(null, 'rebuild', actor) });
    if (route.startsWith('users')) {
      if (account.role !== 'admin')
        return Response.json({ error: 'Administrator access required.' }, { status: 403 });
      if (route === 'users' && method === 'POST') return Response.json(await invite(body, actor));
      const match = route.match(/^users\/([^/]+)(?:\/(reset))?$/);
      if (match) {
        const [, id, action] = match;
        if (action === 'reset' && method === 'POST') {
          const user = db
            .prepare(
              'SELECT u.email,m.status FROM user u JOIN members m ON m.user_id=u.id WHERE u.id=?',
            )
            .get(id) as { email: string; status: string } | undefined;
          if (!user || user.status === 'disabled')
            throw new Error('Activate the account before resetting its password.');
          const url = await resetLink(user.email);
          audit(actor, 'reset-link-created', id);
          return Response.json({ url });
        }
        if (method === 'PATCH') {
          changeMember(id, body, actor);
          return Response.json({ ok: true });
        }
      }
    }
    return new Response('Not found', { status: 404 });
  } catch (error) {
    const err = error as Error;
    return Response.json(
      {
        ...(error instanceof PublishValidation ? { issues: error.issues } : {}),
        error:
          err.name === 'ZodError' ? 'Check all required fields and the URL format.' : err.message,
      },
      { status: error instanceof Conflict ? 409 : 400 },
    );
  }
};
