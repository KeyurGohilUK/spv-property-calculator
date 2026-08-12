-- SPV Property Calculator - SHARED workspace with SOFT DELETE / ARCHIVE
-- Run this whole file in Supabase Dashboard > SQL Editor > New query.
-- Safe to run over the previous shared-workspace schema. Existing property rows are preserved.

create table if not exists public.properties (
  id text primary key,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

alter table public.properties add column if not exists deleted_at timestamptz null;

-- Direct-upgrade safety for the older per-user schema: retain only the newest row
-- for any duplicate property ID before making id globally unique.
delete from public.properties older
using public.properties newer
where older.id = newer.id
  and older.ctid <> newer.ctid
  and (
    older.updated_at < newer.updated_at
    or (older.updated_at = newer.updated_at and coalesce(older.user_id::text, '') > coalesce(newer.user_id::text, ''))
  );

alter table public.properties drop constraint if exists properties_pkey;
alter table public.properties add constraint properties_pkey primary key (id);
alter table public.properties alter column user_id drop not null;
alter table public.properties alter column user_id set default auth.uid();
alter table public.properties drop constraint if exists properties_user_id_fkey;
alter table public.properties add constraint properties_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;

drop index if exists public.properties_user_updated_idx;
create index if not exists properties_updated_idx on public.properties (updated_at desc);
create index if not exists properties_deleted_updated_idx on public.properties (deleted_at, updated_at desc);

alter table public.properties enable row level security;
revoke all on table public.properties from anon;
revoke all on table public.properties from authenticated;
grant select, insert, update on table public.properties to authenticated;

drop policy if exists "Users can read own properties" on public.properties;
drop policy if exists "Users can insert own properties" on public.properties;
drop policy if exists "Users can update own properties" on public.properties;
drop policy if exists "Users can delete own properties" on public.properties;
drop policy if exists "Authenticated users can read shared properties" on public.properties;
drop policy if exists "Authenticated users can insert shared properties" on public.properties;
drop policy if exists "Authenticated users can update shared properties" on public.properties;
drop policy if exists "Authenticated users can delete shared properties" on public.properties;

create policy "Authenticated users can read shared properties"
on public.properties for select to authenticated using (true);

create policy "Authenticated users can insert shared properties"
on public.properties for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Authenticated users can update shared properties"
on public.properties for update to authenticated
using (true) with check (true);

-- Intentionally no DELETE policy. Archive/restore is performed with UPDATE.
