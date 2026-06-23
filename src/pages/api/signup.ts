import type { APIContext } from 'astro';
import { createServerSupabaseClient } from '../../lib/supabase.js';
import { verifyTurnstileToken, getClientIP } from '../../lib/turnstile.js';
import { z } from 'zod';

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().optional(),
  turnstileToken: z.string().min(1, 'Turnstile verification required'),
});

export const POST = async (context: APIContext) => {
  const { request } = context;
  console.log('[API Signup] Received signup request');

  try {
    // Parse and validate body
    const body = await request.json();
    console.log('[API Signup] Request body received:', { 
      email: body.email, 
      hasFullName: !!body.fullName,
      hasTurnstileToken: !!body.turnstileToken 
    });
    
    const parsed = signupSchema.safeParse(body);
    
    if (!parsed.success) {
      const errorMessage = parsed.error.issues[0]?.message || 'Validation failed';
      console.warn('[API Signup] Validation failed:', parsed.error.issues);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          details: parsed.error.issues 
        }),
        { 
          status: 400, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }

    const { email, password, fullName, turnstileToken } = parsed.data;
    const ip = getClientIP(request);
    console.log(`[API Signup] Validated data for ${email}. IP: ${ip || 'unknown'}`);

    // Verify Turnstile
    console.log('[API Signup] Verifying Turnstile token...');
    const turnstileResult = await verifyTurnstileToken(turnstileToken, ip, context);
    if (!turnstileResult.success) {
      console.warn('[API Signup] Turnstile failed:', turnstileResult.error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: turnstileResult.error || 'Turnstile verification failed' 
        }),
        { 
          status: 403, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }
    console.log('[API Signup] Turnstile verification passed');

    // Create Supabase client
    const supabase = createServerSupabaseClient(context);

    console.log(`[API Signup] Attempting Supabase signup for: ${email}`);

    // Sign up with Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${new URL(request.url).origin}/auth/verify`,
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      console.error('[API Signup] Supabase error:', {
        message: error.message,
        status: error.status,
        code: error.code,
        details: error
      });
      
      let userError = 'Signup failed';
      let statusCode = 400;
      
      if (error.message.includes('already registered') || error.code === '225') {
        userError = 'An account with this email already exists. Please sign in instead.';
        statusCode = 409;
      } else if (error.message.includes('Password') || error.message.includes('password')) {
        userError = error.message;
      } else if (error.message.includes('Email')) {
        userError = 'Invalid email address';
      } else {
        userError = error.message; // Return actual error during development
      }
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: userError,
          supabaseError: error.message 
        }),
        { 
          status: statusCode, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`[API Signup] SUCCESS! User created: ${data.user?.id || email}`);
    console.log(`[API Signup] Confirmation email sent to ${email}. Redirect URL was set to /auth/verify`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Account created successfully. Please check your email to verify your account.',
        email: email,
        userId: data.user?.id
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );

  } catch (err: any) {
    console.error('[API Signup] Unexpected error:', err.message, err.stack);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'An unexpected error occurred. Please try again.',
        debug: err.message 
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
};
