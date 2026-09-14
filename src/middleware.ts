import { defineMiddleware } from 'astro:middleware';
import { sessionFor, initAuth } from './lib/auth.mjs';
import { origin } from './lib/config.mjs';
import { recoverJobs } from './lib/publish.mjs';
let started = false;
export const onRequest = defineMiddleware(async (ctx, next) => {
  await initAuth();
  if (!started) {
    recoverJobs();
    started = true;
  }
  const p = ctx.url.pathname;
  const publicRoute = p === '/login' || p === '/set-password' || p.startsWith('/api/auth/');
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(ctx.request.method) &&
    ctx.request.headers.get('origin') !== origin
  )
    return new Response('Invalid request origin', { status: 403 });
  ctx.locals.account = (await sessionFor(ctx.request.headers)) as App.Locals['account'];
  if (!publicRoute && !ctx.locals.account) {
    if (p.startsWith('/api/')) return Response.json({ error: 'Please sign in.' }, { status: 401 });
    return ctx.redirect('/login');
  }
  const response = await next();
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set(
    'Content-Security-Policy',
    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  );
  return response;
});
