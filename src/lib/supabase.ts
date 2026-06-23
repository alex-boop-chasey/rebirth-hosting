import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { APIContext } from 'astro';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = import.meta.env.SUPABASE_SECRET_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

export function createServerSupabaseClient(context?: APIContext | Request | any) {
  console.log('[Supabase] Creating server client');
  
  let cookieStore: any = {
    get(name: string) {
      if (context?.cookies?.get) {
        return context.cookies.get(name)?.value;
      }
      if (context?.request?.headers) {
        const cookieHeader = context.request.headers.get?.('cookie') || context.headers?.get?.('cookie');
        if (cookieHeader) {
          const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
          return match ? decodeURIComponent(match[1]) : undefined;
        }
      }
      if (typeof context === 'string' || (context as Request)?.headers) { // if Request passed directly
        const req = context as Request;
        const cookieHeader = req.headers.get('cookie');
        if (cookieHeader) {
          const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
          return match ? decodeURIComponent(match[1]) : undefined;
        }
      }
      return undefined;
    },
    set(name: string, value: string, options: any = {}) {
      console.log(`[Supabase] Set cookie ${name} (handled by caller for API)`);
      if (context?.cookies?.set) {
        context.cookies.set(name, value, options);
      }
      // For pure Response API routes, caller must handle Set-Cookie header
    },
    remove(name: string, options: any = {}) {
      console.log(`[Supabase] Remove cookie ${name}`);
      if (context?.cookies?.delete) {
        context.cookies.delete(name);
      }
    },
  };

  return createServerClient(supabaseUrl!, supabaseAnonKey!, {
    cookies: cookieStore,
    cookieOptions: {
      secure: import.meta.env.PROD,
      httpOnly: true,
      sameSite: 'lax',
    },
  });
}

export function createServiceSupabaseClient() {
  if (!supabaseServiceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY is not set in environment');
  }
  console.log('[Supabase] Creating service role client for admin operations');
  return createClient(supabaseUrl!, supabaseServiceKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createBrowserSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase public env vars not configured');
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

export type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;
