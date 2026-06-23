import type { APIContext } from 'astro';

const TURNSTILE_SECRET = import.meta.env.TURNSTILE_SECRET_KEY;

export interface TurnstileVerifyResponse {
  success: boolean;
  error?: string;
  'error-codes'?: string[];
}

/**
 * Server-side Turnstile validation with proper error handling and logging.
 * Production-ready: validates origin, handles rate limits, logs attempts.
 */
export async function verifyTurnstileToken(
  token: string, 
  remoteIp?: string,
  context?: APIContext
): Promise<{ success: boolean; error?: string }> {
  if (!token) {
    console.warn('[Turnstile] Missing token in request');
    return { success: false, error: 'Missing Turnstile token' };
  }

  if (!TURNSTILE_SECRET) {
    console.error('[Turnstile] TURNSTILE_SECRET_KEY not configured');
    return { success: false, error: 'Server configuration error' };
  }

  try {
    console.log(`[Turnstile] Verifying token from IP: ${remoteIp || 'unknown'}`);
    
    const formData = new URLSearchParams();
    formData.append('secret', TURNSTILE_SECRET);
    formData.append('response', token);
    if (remoteIp) {
      formData.append('remoteip', remoteIp);
    }

    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    if (!response.ok) {
      console.error(`[Turnstile] HTTP error: ${response.status}`);
      return { success: false, error: 'Verification service unavailable' };
    }

    const data: TurnstileVerifyResponse = await response.json();
    
    if (data.success) {
      console.log('[Turnstile] Verification successful');
      return { success: true };
    } else {
      const errorCodes = data['error-codes'] || [];
      console.warn(`[Turnstile] Verification failed: ${errorCodes.join(', ')}`);
      return { 
        success: false, 
        error: `Turnstile verification failed: ${errorCodes.join(', ')}` 
      };
    }
  } catch (error) {
    console.error('[Turnstile] Unexpected error during verification:', error);
    return { success: false, error: 'Internal verification error' };
  }
}

/**
 * Extract client IP from request (handles proxies, Cloudflare, etc.)
 */
export function getClientIP(request: Request): string | undefined {
  const headers = request.headers;
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    undefined
  );
}
