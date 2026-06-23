import type { APIContext } from 'astro';
import { createServerSupabaseClient } from '../../lib/supabase.js';
import { verifyTurnstileToken, getClientIP } from '../../lib/turnstile.js';

export const POST = async (context: APIContext) => {
  const { request } = context;
  console.log('[API Signin] Received signin request');

  try {
    const body = await request.json();
    const { email, password, turnstileToken } = body;

    if (!email || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email and password are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const ip = getClientIP(request);

    // Verify Turnstile (recommended for signin to prevent brute force attacks)
    if (turnstileToken) {
      const turnstileResult = await verifyTurnstileToken(turnstileToken, ip, context);
      if (!turnstileResult.success) {
        console.warn('[API Signin] Turnstile failed:', turnstileResult.error);
        return new Response(
          JSON.stringify({ success: false, error: turnstileResult.error || 'Turnstile verification failed' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
      console.log('[API Signin] Turnstile verification passed');
    }

    const supabase = createServerSupabaseClient(context);

    console.log(`[API Signin] Attempting signin for: ${email}`);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('[API Signin] Supabase error:', error.message);
      let userError = 'Invalid credentials';
      
      if (error.message.includes('Email not confirmed')) {
        userError = 'Please verify your email before signing in.';
      }
      
      return new Response(
        JSON.stringify({ success: false, error: userError }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[API Signin] Successful login for user: ${data.user.id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Sign in successful',
        redirect: '/dashboard'
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
