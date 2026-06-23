import { defineMiddleware } from 'astro:middleware';
import { getSession, createRedirectResponse } from './lib/auth.js';

export const onRequest = defineMiddleware(async (context, next) => {
  const { url } = context;
  const path = url.pathname;

  console.log(`[Middleware] Request to: ${path}`);

  // Public paths that don't require auth
  const publicPaths = [
    '/', 
    '/signup', 
    '/signin', 
    '/check-email', 
    '/auth/verify'
  ];
  
  if (publicPaths.includes(path) || path.startsWith('/api/')) {
    return next();
  }

  // Protected paths - TEMPORARILY DISABLED onboarding check as requested
  const session = await getSession(context);
  
  if (!session?.user) {
    console.log(`[Middleware] No session - redirecting to /signin from ${path}`);
    return createRedirectResponse('/signin');
  }

  // For now, allow all authenticated users to reach dashboard
  // Onboarding enforcement is disabled until we re-enable it
  console.log(`[Middleware] Authenticated user ${session.user.id} allowed to access ${path}`);

  return next();
});
