# Supabase RLS Policies for profiles Table

## Table Schema Recommendation
```sql
-- Enable RLS
alter table profiles enable row level security;

-- Profiles table (create if not exists)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique,
  full_name text,
  company_name text,
  onboarding_completed boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Trigger to create profile on auth signup (optional but recommended)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, onboarding_completed)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', false);
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

## RLS Policies (Production Recommendations)

### 1. Users can only read/update their own profile
```sql
-- Select own profile
create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = id);

-- Update own profile (but onboarding_completed only via verified flow)
create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id 
    and (
      -- Prevent changing onboarding_completed back to false after true
      (old.onboarding_completed = false or new.onboarding_completed = true)
    )
  );
```

### 2. Service role can manage all (for API endpoints)
-- Service role key bypasses RLS by default. Use in /api/onboarding with createServiceSupabaseClient().

### 3. Additional policies
```sql
-- Insert policy (if not using trigger)
create policy "Enable insert for authenticated users"
  on profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- Policy for admins if you have roles
-- create policy "Admins can view all profiles" on profiles for select using (is_admin());
```

## Best Practices
- Always use `auth.uid() = id` for user-scoped access.
- Use DB triggers for automatic profile creation on signup to avoid race conditions.
- Set `onboarding_completed` default to `false`.
- For verification flow: after email confirm, the /auth/verify page or middleware checks `onboarding_completed` to route to /onboarding only once.
- Index on `id` and `onboarding_completed`.
- Audit logs via Supabase dashboard for profile changes.
- Never expose service role key client-side.

These policies ensure the one-time onboarding enforcement is secure. Test with Supabase SQL editor.
