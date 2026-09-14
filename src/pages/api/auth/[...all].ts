import type { APIRoute } from 'astro';
import { auth } from '../../../lib/auth.mjs';
export const ALL: APIRoute = async ({ request, url, clientAddress }) => {
  const path = url.pathname.replace('/api/auth/', '');
  const allowed = ['sign-in/email', 'sign-out', 'get-session', 'reset-password', 'change-password'];
  if (!allowed.includes(path) && !/^reset-password\/[A-Za-z0-9_-]+$/.test(path))
    return new Response('Not found', { status: 404 });
  const headers = new Headers(request.headers);
  headers.set('x-studio-client-ip', clientAddress);
  if (request.method === 'POST') {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (reader)
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 16384) {
          await reader.cancel();
          return new Response('Request too large', { status: 413 });
        }
        chunks.push(value);
      }
    return auth.handler(
      new Request(request.url, { method: request.method, headers, body: Buffer.concat(chunks) }),
    );
  }
  return auth.handler(new Request(request.url, { method: request.method, headers }));
};
