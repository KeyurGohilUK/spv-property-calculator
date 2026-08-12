-- SPV Property Calculator - SHARED Supabase workspace setup
-- Run this whole file in Supabase Dashboard > SQL Editor > New query.
--
-- This script is safe to run on the previous per-user version of the app.
-- It preserves existing rows, changes the property ID to be globally unique,
-- and changes RLS so every AUTHENTICATED user can see/edit/delete the same properties.
-- Signed-out/anonymous visitors still have no access.

create table if not exists public.properties (
  id text primary key,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----- Upgrade from the older per-user schema -----
-- The previous app used primary key (user_id, id). Property IDs are UUIDs, so
-- collisions are extremely unlikely; if the same ID does exist more than once,
-- keep the newest copy before making id the shared primary key.
delete from public.properties older
using public.properties newer
where older.id = newer.id
  and (
    older.updated_at < newer.updated_at
    or (
      older.updated_at = newer.updated_at
      and coalesce(older.user_id::text, '') > coalesce(newer.user_id::text, '')
    )
  );

alter table public.properties drop constraint if exists properties_pkey;
alter table public.properties add constraint properties_pkey primary key (id);

-- user_id now records who originally created a row. It is NOT used to restrict
-- access. Deleting an Auth user must not delete a shared property.
alter table public.properties alter column user_id drop not null;
alter table public.properties alter column user_id set default auth.uid();
alter table public.properties drop constraint if exists properties_user_id_fkey;
alter table public.properties
  add constraint properties_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

drop index if exists public.properties_user_updated_idx;
create index if not exists properties_updated_idx
  on public.properties (updated_at desc);

-- Never expose property data without RLS.
alter table public.properties enable row level security;

-- Anonymous/signed-out visitors cannot read or write. Signed-in users receive
-- table privileges, with RLS below deciding which rows they can access.
revoke all on table public.properties from anon;
grant select, insert, update, delete on table public.properties to authenticated;

-- Remove policies from the older per-user edition and any previous shared run.
drop policy if exists "Users can read own properties" on public.properties;
drop policy if exists "Users can insert own properties" on public.properties;
drop policy if exists "Users can update own properties" on public.properties;
drop policy if exists "Users can delete own properties" on public.properties;
drop policy if exists "Authenticated users can read shared properties" on public.properties;
drop policy if exists "Authenticated users can insert shared properties" on public.properties;
drop policy if exists "Authenticated users can update shared properties" on public.properties;
drop policy if exists "Authenticated users can delete shared properties" on public.properties;

-- SHARED WORKSPACE POLICIES
-- Every authenticated user in this Supabase project sees the same property rows.
create policy "Authenticated users can read shared properties"
on public.properties
for select
to authenticated
using (true);

-- New rows record the currently signed-in user as their creator via the column default.
create policy "Authenticated users can insert shared properties"
on public.properties
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Authenticated users can update shared properties"
on public.properties
for update
to authenticated
using (true)
with check (true);

create policy "Authenticated users can delete shared properties"
on public.properties
for delete
to authenticated
using (true);
