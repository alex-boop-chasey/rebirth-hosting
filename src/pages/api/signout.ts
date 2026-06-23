import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ cookies, redirect }) => {
  cookies.delete('sb-access-token', { path: '/' });
  cookies.delete('sb-refresh-token', { path: '/' });
  
  console.log('[API Signout] Session cleared, redirecting to signin');
  return redirect('/signin', 302);
};
