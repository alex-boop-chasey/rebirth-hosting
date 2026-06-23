import { defineMiddleware } from 'astro:middleware';
import { getSession, checkOnboardingStatus, createRedirectResponse } from './lib/auth.js';

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies } = context;
  const path = url.pathname;

  console.log(`[Middleware] Request to: ${path}`);

  // Public paths that don't require auth
  const publicPaths = ['/', '/signup', '/signin', '/check-email', '/auth/verify'];
  if (publicPaths.includes(path) || path.startsWith('/api/')) {
    return next();
  }

  // Protected paths
  const session = await getSession(context);
  
  if (!session?.user) {
    console.log(`[Middleware] No session - redirecting to /signin from ${path}`);
    return createRedirectResponse('/signin');
  }

  const userId = session.user.id;
  
  // Check if user needs to complete onboarding (one-time)
  if (path !== '/onboarding') {
    const { completed } = await checkOnboardingStatus(userId, context);
    
    if (!completed) {
      console.log(`[Middleware] Onboarding not completed - redirecting user ${userId} to /onboarding`);
      return createRedirectResponse('/onboarding');
    }
  }

  // Dashboard and other protected routes are allowed if onboarding is done
  if (path === '/onboarding') {
    const { completed } = await checkOnboardingStatus(userId, context);
    if (completed) {
      console.log(`[Middleware] Onboarding already completed - redirecting to /dashboard`);
      return createRedirectResponse('/dashboard');
    }
  }

  return next();
});
