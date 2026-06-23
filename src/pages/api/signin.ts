import type { APIContext } from 'astro';
import { createServerSupabaseClient } from '../../lib/supabase.js';
import { verifyTurnstileToken, getClientIP } from '../../lib/turnstile.js';
import { z } from 'zod';

const signinSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  turnstileToken: z.string().optional(),
});

export const POST = async (context: APIContext) => {
  const { request } = context;
  console.log('[API Signin] Received signin request');

  try {
    const body = await request.json();
    const parsed = signinSchema.safeParse(body);
    
    if (!parsed.success) {
      const errorMessage = parsed.error.issues[0]?.message || 'Validation failed';
      console.warn('[API Signin] Validation failed:', parsed.error.issues);
      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { email, password, turnstileToken } = parsed.data;
    const ip = getClientIP(request);

    // Optional Turnstile for signin (recommended in prod to prevent brute force)
    if (turnstileToken) {
      const turnstileResult = await verifyTurnstileToken(turnstileToken, ip, context);
      if (!turnstileResult.success) {
        console.warn('[API Signin] Turnstile failed:', turnstileResult.error);
        return new Response(
          JSON.stringify({ success: false, error: turnstileResult.error }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    const supabase = createServerSupabaseClient(request);

    console.log(`[API Signin] Attempting signin for: ${email}`);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('[API Signin] Supabase auth error:', error.message);
      let userError = 'Invalid credentials';
      
      if (error.message.includes('Email not confirmed')) {
        userError = 'Please verify your email before signing in.';
      }
      
      return new Response(
        JSON.stringify({ success: false, error: userError }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[API Signin] Successful for user: ${data.user.id}`);

    // After signin, the session is set via cookies by Supabase SSR client
    // In practice, for API, we may need to set cookies in response headers.
    // For simplicity, client should call supabase.auth.setSession or use the returned data.

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Sign in successful',
        session: data.session ? { user: { id: data.user.id, email: data.user.email } } : null,
        redirect: '/dashboard' // Client decides based on onboarding status
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );

  } catch (err: any) {
    console.error('[API Signin] Unexpected error:', err);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
