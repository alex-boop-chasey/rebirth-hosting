# Sign-In Page Reload Issue

**Date**: June 24, 2026
**Branch**: main
**Problem**: The sign-in page reloads on submit after adding Turnstile captcha. The signup page works fine.

## Brief Description of the Problem

The sign-in page worked perfectly with a simple native HTML form (`<form action="/api/signin" method="POST">`).

When we added the Turnstile captcha (widget + JavaScript initialization), the page started reloading on submit instead of calling the API and redirecting to the dashboard.

**Root Cause** (from code comparison):
- The captcha addition replaced the native form with a JavaScript-dependent flow.
- The `submit` event listener (`form.addEventListener('submit', (e) => { e.preventDefault(); ... })`) is nested inside `document.addEventListener('DOMContentLoaded', () => { ... })`.
- The Turnstile script in `Layout.astro` uses `async defer`, so `DOMContentLoaded` fires before the inline script runs.
- The listener is never attached → native form submission to current URL (`/signin`) → page reloads.
- Signup.astro avoids this with slightly different script structure (top-level variables, retry logic).

This matches the user's clue: "the sign-in page was working until we added the captcha".

## Relevant Files and Code

### 1. `src/pages/signin.astro` (Current Broken Version - with captcha)
```astro
<form id="signin-form" class="space-y-6">
  <Input name="email" ... />
  <Input name="password" ... />
  <div id="turnstile-container"></div>
  <Button type="submit" id="submit-btn">Sign In</Button>
</form>

<script>
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('signin-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();  // This never runs due to timing
      // fetch('/api/signin') never happens
    });
  });
</script>
```

### 2. `src/pages/signup.astro` (Working Version - with captcha)
```astro
<form id="signup-form" class="space-y-6">
  ...
  <div id="turnstile-container"></div>
</form>

<script>
  let turnstileToken = '';
  function initializeTurnstile() { ... }
  document.addEventListener('DOMContentLoaded', () => {
    initializeTurnstile();
    const form = document.getElementById('signup-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      // This works
    });
  });
</script>
```

### 3. `src/components/Layout.astro` (Turnstile Script)
```astro
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
```

### 4. `src/pages/api/signin.ts` (Backend - not reached due to reload)
```ts
export const POST = async (context) => {
  // Verifies Turnstile, calls supabase.auth.signInWithPassword, sets cookies
  // Returns JSON with success/redirect
};
```

### 5. `src/middleware.ts` (Not the cause)
- Skips `/signin` and `/api/signin`
- Only protects other routes

## Files That Were Changed When Captcha Was Added
- `src/pages/signin.astro` (added script + Turnstile div, removed native form attributes)
- `src/pages/api/signin.ts` (added optional Turnstile check)

## Recommended Next Step
Revert to the native form version that worked (no JS in signin.astro) and keep captcha only on signup, or fix the timing issue by moving the form listener outside `DOMContentLoaded`.

**Status**: Main branch is now back to the working state without captcha on sign-in.

Created: June 24, 2026
Last Updated: June 24, 2026
