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
    const parsed = signupSchema.safeParse(body);
    
    if (!parsed.success) {
      const errorMessage = parsed.error.issues[0]?.message || 'Validation failed';
      console.warn('[API Signup] Validation failed:', parsed.error.issues);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage 
        }),
        { 
          status: 400, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }

    const { email, password, fullName, turnstileToken } = parsed.data;
    const ip = getClientIP(request);

    // Verify Turnstile
    const turnstileResult = await verifyTurnstileToken(turnstileToken, ip, context);
    if (!turnstileResult.success) {
      console.warn('[API Signup] Turnstile failed:', turnstileResult.error);
      return new Response(
        JSON.stringify({ success: false, error: turnstileResult.error }),
        { 
          status: 403, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }

    // Create Supabase client
    const supabase = createServerSupabaseClient(context);

    console.log(`[API Signup] Attempting signup for email: ${email}`);

    // Sign up with Supabase - email confirmation enabled by default in Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${new URL(request.url).origin}/onboarding`,  // As per task, but ideally use verify page
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      console.error('[API Signup] Supabase error:', error.message);
      let userError = 'Signup failed';
      
      if (error.message.includes('already registered')) {
        userError = 'User already exists. Try signing in.';
      } else if (error.message.includes('Password')) {
        userError = error.message;
      }
      
      return new Response(
        JSON.stringify({ success: false, error: userError }),
        { 
          status: 400, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`[API Signup] Success for user: ${data.user?.id || email}. Confirmation email sent.`);

    // Note: Profile will be created via DB trigger or in onboarding API. 
    // For one-time, we rely on profiles table check.

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Signup successful. Please check your email to verify.',
        userId: data.user?.id,
        // In production, might return session if auto-confirm, but here email confirm
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
        error: 'Internal server error. Please try again.' 
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
};
