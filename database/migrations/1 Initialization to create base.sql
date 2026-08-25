-- SPV Property Calculator - Supabase setup
-- Run this whole file in Supabase Dashboard > SQL Editor > New query.

create table if not exists public.properties (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists properties_user_updated_idx
  on public.properties (user_id, updated_at desc);

-- Never expose the table without RLS.
alter table public.properties enable row level security;

-- Use least privilege: signed-out visitors cannot read/write property data.
revoke all on table public.properties from anon;
grant select, insert, update, delete on table public.properties to authenticated;

-- Re-running this file is safe: replace the app's policies with the expected definitions.
drop policy if exists "Users can read own properties" on public.properties;
drop policy if exists "Users can insert own properties" on public.properties;
drop policy if exists "Users can update own properties" on public.properties;
drop policy if exists "Users can delete own properties" on public.properties;

create policy "Users can read own properties"
on public.properties
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own properties"
on public.properties
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own properties"
on public.properties
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own properties"
on public.properties
for delete
to authenticated
using ((select auth.uid()) = user_id);
