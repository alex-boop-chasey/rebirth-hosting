import { defineMiddleware } from 'astro:middleware';
import { getSession, createRedirectResponse } from './lib/auth.js';

export const onRequest = defineMiddleware(async (context, next) => {
  const { url } = context;
  const path = url.pathname;

  // Public paths
  const publicPaths = ['/', '/signup', '/signin', '/check-email', '/auth/verify'];
  if (publicPaths.includes(path) || path.startsWith('/api/')) {
    return next();
  }

  // All other paths require authentication
  const session = await getSession(context);
  
  if (!session?.user) {
    console.log(`[Middleware] No session - redirecting to /signin from ${path}`);
    return createRedirectResponse('/signin');
  }

  console.log(`[Middleware] Authenticated user ${session.user.id} accessing ${path}`);
  return next();
});
