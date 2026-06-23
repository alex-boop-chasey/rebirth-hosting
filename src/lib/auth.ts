import type { APIContext } from 'astro';
import { createServerSupabaseClient, createServiceSupabaseClient } from './supabase.js';

/**
 * Get current session with logging and error resilience.
 */
export async function getSession(context: APIContext | any) {
  try {
    const supabase = createServerSupabaseClient(context);
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('[Auth] Session error:', error.message);
      return null;
    }
    
    console.log('[Auth] Session retrieved:', session ? `User ${session.user.id}` : 'No session');
    return session;
  } catch (err: any) {
    console.error('[Auth] Failed to get session:', err.message);
    return null;
  }
}

/**
 * Require authentication - returns error object if not authenticated.
 * Used in protected API routes and middleware.
 */
export async function requireAuth(context: APIContext) {
  const session = await getSession(context);
  if (!session?.user) {
    return {
      success: false as const,
      error: 'Authentication required',
      status: 401 as const,
    };
  }
  return { 
    success: true as const, 
    user: session.user, 
    session 
  };
}

/**
 * Check onboarding status from profiles table.
 * Enforces one-time onboarding. Uses service client for bypass if needed.
 */
export async function checkOnboardingStatus(userId: string, context?: APIContext) {
  try {
    // Prefer service client for admin-like checks in auth flow to avoid RLS issues during onboarding
    const serviceClient = createServiceSupabaseClient();
    const { data: profile, error } = await serviceClient
      .from('profiles')
      .select('onboarding_completed, full_name, company_name')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // No rows returned
        console.log(`[Auth] No profile found for user ${userId}, onboarding pending`);
        return { completed: false, profile: null };
      }
      console.error('[Auth] Profile check error:', error.message);
      return { completed: false, profile: null };
    }

    const completed = profile?.onboarding_completed === true;
    console.log(`[Auth] Onboarding status for ${userId}: ${completed ? 'COMPLETED' : 'PENDING'}`);
    
    return { completed, profile };
  } catch (err: any) {
    console.error('[Auth] Onboarding check failed:', err.message);
    return { completed: false, profile: null };
  }
}

/**
 * Create standardized redirect response.
 */
export function createRedirectResponse(url: string, status: number = 302) {
  console.log(`[Auth] Redirecting to: ${url} (status ${status})`);
  return new Response(null, {
    status,
    headers: { Location: url },
  });
}
