# Rebirth Hosting: Customer Auth + Onboarding Architecture Plan

**Version**: 1.0  
**Date**: 2026-06-23  
**Tech**: Astro 7 + Tailwind v4 (amber/orange dark theme) + Supabase + Cloudflare Turnstile  
**Goals**: Production-ready, mobile-first, modular, no regressions on core flows, one-time onboarding enforced via `profiles` table.

## 1. File Structure

```
src/
├── components/
│   ├── auth/
│   │   ├── SignupForm.astro          # Turnstile + email/password signup (server action)
│   │   ├── VerifyEmail.astro         # Check-email page UI + resend handler
│   │   ├── OnboardingForm.astro      # One-time profile completion form
│   │   └── AuthGuard.astro           # Island or server component for session checks
│   ├── ui/
│   │   ├── Button.astro
│   │   ├── Card.astro
│   │   ├── Input.astro
│   │   └── Toast.astro               # For success/error messages
│   ├── layout/
│   │   ├── AuthLayout.astro          # Minimal layout for signup/check-email/verify
│   │   └── DashboardLayout.astro     # Protected layout with sidebar/nav
│   └── common/
│       └── TurnstileWidget.client.ts # Client island for Turnstile rendering
├── lib/
│   ├── supabase.ts                   # Factory for browserClient & serverClient
│   ├── auth.ts                       # Utilities: getSession, requireAuth, checkOnboardingStatus
│   ├── turnstile.ts                  # Server-side Turnstile verification
│   ├── utils.ts                      # General helpers (redirects, errors)
│   └── types.ts                      # Shared TypeScript types
├── middleware.ts                     # Core auth + onboarding routing logic
├── pages/
│   ├── index.astro                   # Landing page (existing, update CTA to /signup)
│   ├── signup.astro                  # Public signup page
│   ├── check-email.astro             # Post-signup "check your email" page
│   ├── onboarding.astro              # One-time onboarding (protected + enforced)
│   ├── dashboard.astro               # Main protected dashboard
│   └── auth/
│       └── verify.astro              # Handles Supabase email verification redirect + OTP
├── api/
│   └── auth/
│       └── callback.ts               # Supabase auth callback handler (if using OAuth later)
│   └── turnstile/
│       └── verify.ts                 # Server endpoint for Turnstile token validation
├── env.d.ts                          # Type definitions for env vars
└── styles/
    └── global.css                    # Existing Tailwind v4 + amber/orange theme
```

**Additional directories (future-proof)**:
- `src/types/supabase.ts` (generated via Supabase CLI)
- `src/features/` (for future modularization of dashboard, billing, etc.)

## 2. Supabase Integration Strategy

### Environment Variables (`.env`)
```env
# Public (exposed to client)
PUBLIC_SUPABASE_URL=https://...
PUBLIC_SUPABASE_ANON_KEY=eyJ...
# Server-only
SUPABASE_SERVICE_ROLE_KEY=...
TURNSTILE_SECRET_KEY=1x...
```

**Types**: Extend `src/env.d.ts`:
```ts
interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly TURNSTILE_SECRET_KEY: string;
}
```

### Client vs Server
- **`src/lib/supabase.ts`**:
  ```ts
  import { createBrowserClient } from '@supabase/ssr';
  import { createServerClient } from '@supabase/ssr';

  export const createClient = (cookieStore?: any) => {
    if (typeof window !== 'undefined') {
      return createBrowserClient(
        import.meta.env.PUBLIC_SUPABASE_URL,
        import.meta.env.PUBLIC_SUPABASE_ANON_KEY
      );
    }
    return createServerClient(
      import.meta.env.PUBLIC_SUPABASE_URL,
      import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
      { cookies: cookieStore }
    );
  };
  ```
- **Client-side** (`*.client.ts` islands or `onMount`): `createBrowserClient` for auth state listener (`supabase.auth.onAuthStateChange`), realtime.
- **Server-side** (middleware, API routes, `getData` in pages, Actions): `createServerClient` with Astro cookies for SSR auth. Use service role only for admin operations (e.g. profile management).
- Install required: `npm install @supabase/supabase-js @supabase/ssr`

**Database Schema** (Supabase):
- `auth.users` (managed)
- `profiles` table (RLS enabled):
  ```sql
  create table profiles (
    id uuid references auth.users primary key,
    email text,
    full_name text,
    company_name text,
    onboarding_completed boolean default false,
    created_at timestamp default now()
  );
  ```
- Database trigger to create profile row on user signup with `onboarding_completed = false`.

## 3. Routing Flow

```
Landing (/) 
  → Signup (/signup) 
    → Supabase signUp() + Turnstile verify 
    → Redirect to /check-email (with email in query or session flash)
  → Check Email (/check-email)
    → User clicks verification link in email
  → Verify (/auth/verify?token=...&type=signup)
    → supabase.auth.verifyOtp()
    → Check profiles.onboarding_completed
       ├── false → /onboarding (one-time)
       └── true  → /dashboard
  → Onboarding (/onboarding) [protected]
    → Form submits profile data + sets onboarding_completed = true
    → Redirect to /dashboard
  → Dashboard (/dashboard) [protected]
```

- All protected routes (`/onboarding`, `/dashboard`, etc.) guarded by `middleware.ts`.
- Public routes (`/`, `/signup`, `/check-email`) allow unauthenticated access.

## 4. Email Verification Redirect to One-Time Onboarding

- In Supabase Dashboard → Authentication → Email Templates: Set **Confirmation URL** to `https://yoursite.com/auth/verify`.
- `src/pages/auth/verify.astro`:
  - Extracts `token` and `type` from URLSearchParams.
  - Calls `supabase.auth.verifyOtp({ token, type })`.
  - On success: 
    ```ts
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('onboarding_completed').eq('id', user.id).single();
    
    if (!profile?.onboarding_completed) {
      return Astro.redirect('/onboarding');
    }
    return Astro.redirect('/dashboard');
    ```
- Fallback error handling and loading state (mobile-friendly spinner).
- Resend verification from `/check-email` page using Supabase `resend()`.

## 5. State Management for "One-Time" Onboarding

- **Source of truth**: `profiles.onboarding_completed` (boolean).
- **Middleware logic** (`src/middleware.ts`):
  ```ts
  import { createClient } from '../lib/supabase';

  export async function onRequest({ locals, request, redirect }) {
    const supabase = createClient({ cookies: /* Astro cookies */ });
    const { data: { session } } = await supabase.auth.getSession();

    const url = new URL(request.url);
    
    // Protected routes
    if (['/onboarding', '/dashboard'].includes(url.pathname) && !session) {
      return redirect('/signup');
    }

    if (session) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', session.user.id)
        .single();

      const isOnboarding = url.pathname === '/onboarding';
      
      if (!profile?.onboarding_completed && !isOnboarding) {
        return redirect('/onboarding');
      }
      
      if (profile?.onboarding_completed && isOnboarding) {
        return redirect('/dashboard');
      }
    }

    return next();
  }
  ```
- Onboarding form updates the flag atomically.
- No localStorage or complex client state — server authoritative. Auth listener in layout island for real-time session sync.

## 6. Turnstile Integration Points

1. **Signup page** (`SignupForm.astro`): Render `<TurnstileWidget.client.ts>` (loads `turnstile.js` script).
2. **Form submission**: Capture `turnstileToken` and include in POST/Action.
3. **Server verification** (`lib/turnstile.ts` or API route):
   ```ts
   async function verifyTurnstile(token: string, ip: string) {
     const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
       method: 'POST',
       body: new URLSearchParams({
         secret: import.meta.env.TURNSTILE_SECRET_KEY,
         response: token,
         remoteip: ip,
       }),
     });
     const data = await res.json();
     return data.success;
   }
   ```
4. **Integration**: In signup server action/middleware — `if (!await verifyTurnstile(token)) return error(403)`.
5. **Additional points**: Login (optional), onboarding form (recommended for production).

Use official `@cloudflare/turnstile` if adding framework component, else vanilla script + client island.

## 7. Modular Astro Best Practices

- **Server-first**: `.astro` pages/components for SSR. Use client directives (`client:load`, `.client.ts`) **only** for Turnstile widget, auth listener, and interactive forms.
- **Reusable components**: All UI in `components/ui/` and `components/auth/`. Consistent amber/orange styling matching `global.css`.
- **Type safety**: Supabase generated types + Zod for forms.
- **Error handling**: Centralized `utils.ts` with `AstroError` and user-friendly toasts.
- **Performance**: No unnecessary JS. Use Astro View Transitions for SPA-like navigation between auth → onboarding → dashboard.
- **Mobile-first**: Tailwind responsive classes, touch-friendly buttons, proper viewport meta (already in index).
- **Security**: RLS on all tables, middleware protection, Turnstile on all public forms, no secret exposure.
- **Testing/Production**: 
  - Protected routes tested with middleware.
  - Env validation on build.
  - Cloudflare Pages deployment ready (existing config).
- **Extensibility**: Clear separation allows easy addition of OAuth, passwordless, billing flows without regression.

**Implementation Order**:
1. Install deps + update `lib/supabase.ts` + middleware.
2. Create auth pages and components.
3. Implement verify + onboarding flow with profiles table.
4. Add Turnstile + integrate into signup.
5. Update landing CTA and test full flow end-to-end.
6. Add dashboard skeleton.

This plan maintains existing conventions (amber/orange theme, minimal src structure, Supabase in `.env`) while delivering a robust, production-grade auth + onboarding system.

**Next**: Execute by creating the files defined above. No breaking changes to landing page core.
