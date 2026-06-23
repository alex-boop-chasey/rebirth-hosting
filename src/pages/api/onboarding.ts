import type { APIContext } from 'astro';
import { createServerSupabaseClient, createServiceSupabaseClient } from '../../lib/supabase.js';
import { z } from 'zod';

const onboardingSchema = z.object({
  full_name: z.string().min(1, 'Full name is required'),
  company_name: z.string().min(1, 'Business name is required'),
  business_type: z.string().min(1, 'Business type is required'),
  use_case: z.string().min(10, 'Please describe your use case in detail'),
  website: z.string().url('Please enter a valid website URL').optional().or(z.literal('')),
});

export const POST = async (context: APIContext) => {
  const { request } = context;
  console.log('[API Onboarding] Received request');

  try {
    // Get session from server client (cookies from request)
    const supabase = createServerSupabaseClient(request);
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      console.warn('[API Onboarding] Unauthorized access attempt');
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized. Please sign in.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const user = session.user;
    console.log(`[API Onboarding] Processing for user: ${user.id}`);

    // Parse body
    const body = await request.json();
    const parsed = onboardingSchema.safeParse(body);
    
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message || 'Invalid data';
      console.warn('[API Onboarding] Validation error:', errorMsg);
      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { full_name, company_name, business_type, use_case, website } = parsed.data;

    // Use service client to bypass RLS for profile management (or ensure RLS allows user to update own)
    const serviceClient = createServiceSupabaseClient();

    // Check if profile already exists and onboarding completed (one-time enforcement)
    const { data: existingProfile } = await serviceClient
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .single();

    if (existingProfile?.onboarding_completed) {
      console.log('[API Onboarding] Onboarding already completed, redirecting');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Onboarding already completed',
          redirect: '/dashboard' 
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Upsert profile data - one time enforcement via flag. Expanded fields for business type, use case, website.
    const { data: profile, error } = await serviceClient
      .from('profiles')
      .upsert({
        id: user.id,
        email: user.email,
        full_name,
        company_name,
        business_type,
        use_case,
        website: website || null,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id',
      })
      .select()
      .single();

    if (error) {
      console.error('[API Onboarding] Database error:', error.message);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to save profile. Please try again.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[API Onboarding] Successfully completed for user ${user.id}: ${full_name}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Onboarding completed successfully',
        profile,
        redirect: '/dashboard'
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );

  } catch (err: any) {
    console.error('[API Onboarding] Unexpected error:', err.message);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
