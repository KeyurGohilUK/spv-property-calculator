-- ============================================================================
-- SPV Property Calculator - FINAL Supabase schema
-- Shared workspace + Archive/Restore + Permanent Delete + Shared Notes
-- + Delete Own Notes
--
-- SAFE FOR THE CURRENT DATABASE:
-- - Preserves existing properties
-- - Preserves existing notes
-- - DOES NOT drop/recreate properties_pkey
-- - Safe to run repeatedly
--
-- Run the whole file in:
-- Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================================


-- ============================================================================
-- 1. SHARED PROPERTIES
-- ============================================================================

create table if not exists public.properties (
  id text primary key,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

-- Upgrade safety for existing installations.
alter table public.properties
  add column if not exists deleted_at timestamptz null;

alter table public.properties
  alter column user_id drop not null;

alter table public.properties
  alter column user_id set default auth.uid();

-- Keep creator reference but do not delete a shared property if an Auth user
-- is removed.
alter table public.properties
  drop constraint if exists properties_user_id_fkey;

alter table public.properties
  add constraint properties_user_id_fkey
  foreign key (user_id)
  references auth.users(id)
  on delete set null;

-- IMPORTANT:
-- Do NOT drop/recreate properties_pkey here.
-- property_notes.property_id depends on properties(id), and the current
-- database already uses properties(id) as its shared primary key.

drop index if exists public.properties_user_updated_idx;

create index if not exists properties_updated_idx
  on public.properties (updated_at desc);

create index if not exists properties_deleted_updated_idx
  on public.properties (deleted_at, updated_at desc);


-- ============================================================================
-- 2. PROPERTY ROW LEVEL SECURITY
-- ============================================================================

alter table public.properties enable row level security;

revoke all on table public.properties from anon;
revoke all on table public.properties from authenticated;

-- Normal clients can read/create/update.
-- Direct DELETE is intentionally not granted.
grant select, insert, update
on table public.properties
to authenticated;

-- Remove policies from all earlier versions.
drop policy if exists "Users can read own properties"
  on public.properties;

drop policy if exists "Users can insert own properties"
  on public.properties;

drop policy if exists "Users can update own properties"
  on public.properties;

drop policy if exists "Users can delete own properties"
  on public.properties;

drop policy if exists "Authenticated users can read shared properties"
  on public.properties;

drop policy if exists "Authenticated users can insert shared properties"
  on public.properties;

drop policy if exists "Authenticated users can update shared properties"
  on public.properties;

drop policy if exists "Authenticated users can delete shared properties"
  on public.properties;


-- Every authenticated user can see the same property list.
create policy "Authenticated users can read shared properties"
on public.properties
for select
to authenticated
using (true);


-- New property rows must belong to the currently authenticated creator.
create policy "Authenticated users can insert shared properties"
on public.properties
for insert
to authenticated
with check ((select auth.uid()) = user_id);


-- Every authenticated workspace user may edit/archive/restore a property.
create policy "Authenticated users can update shared properties"
on public.properties
for update
to authenticated
using (true)
with check (true);

-- No DELETE policy on public.properties.
-- Normal deletion = soft delete/archive using deleted_at.
-- Permanent deletion = RPC below.


-- ============================================================================
-- 3. PERMANENT-DELETION TOMBSTONES
-- ============================================================================
-- When an archived property is permanently deleted, the real property row is
-- removed. This table keeps only its ID and deletion timestamp so an older
-- offline device cannot recreate it during a later sync.

create table if not exists public.property_deletions (
  id text primary key,
  deleted_at timestamptz not null default now(),
  deleted_by uuid default auth.uid() references auth.users(id) on delete set null
);

alter table public.property_deletions enable row level security;

revoke all on table public.property_deletions from anon;
revoke all on table public.property_deletions from authenticated;

-- Authenticated devices need only to read tombstones during sync.
grant select
on table public.property_deletions
to authenticated;

drop policy if exists "Authenticated users can read permanent deletions"
  on public.property_deletions;

create policy "Authenticated users can read permanent deletions"
on public.property_deletions
for select
to authenticated
using (true);


-- ============================================================================
-- 4. PERMANENT DELETE RPC
-- ============================================================================
-- Direct table DELETE remains unavailable to browser clients.
-- This RPC:
--   1. Requires authentication
--   2. Only accepts a property already archived (deleted_at is not null)
--   3. Writes a deletion tombstone
--   4. Permanently deletes the property
--
-- Notes linked to the property are deleted automatically through ON DELETE
-- CASCADE on property_notes.property_id.

create or replace function public.permanently_delete_property(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- Lock and verify that the row is already archived.
  perform 1
  from public.properties
  where id = p_id
    and deleted_at is not null
  for update;

  if not found then
    raise exception 'Only archived properties can be permanently deleted';
  end if;

  insert into public.property_deletions (
    id,
    deleted_at,
    deleted_by
  )
  values (
    p_id,
    now(),
    auth.uid()
  )
  on conflict (id)
  do update set
    deleted_at = excluded.deleted_at,
    deleted_by = excluded.deleted_by;

  delete from public.properties
  where id = p_id;
end;
$$;

revoke all
on function public.permanently_delete_property(text)
from public;

revoke all
on function public.permanently_delete_property(text)
from anon;

grant execute
on function public.permanently_delete_property(text)
to authenticated;


-- ============================================================================
-- 5. SHARED PROPERTY NOTES
-- ============================================================================
-- Notes are shared between all authenticated users.
-- Each note stores the author's user ID and a snapshot of their display name.
-- Notes cannot be edited through the client.
-- A user may permanently delete only their OWN note.

create table if not exists public.property_notes (
  id uuid primary key default gen_random_uuid(),
  property_id text not null
    references public.properties(id)
    on delete cascade,
  author_user_id uuid default auth.uid()
    references auth.users(id)
    on delete set null,
  author_name text not null
    check (char_length(btrim(author_name)) between 1 and 120),
  note text not null
    check (char_length(btrim(note)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists property_notes_property_created_idx
  on public.property_notes (property_id, created_at desc);


-- ============================================================================
-- 6. NOTES ROW LEVEL SECURITY
-- ============================================================================

alter table public.property_notes enable row level security;

revoke all on table public.property_notes from anon;
revoke all on table public.property_notes from authenticated;

-- No UPDATE permission: note history is append-only except for deleting your
-- own note.
grant select, insert, delete
on table public.property_notes
to authenticated;


drop policy if exists "Authenticated users can read shared property notes"
  on public.property_notes;

drop policy if exists "Authenticated users can add shared property notes"
  on public.property_notes;

drop policy if exists "Authenticated users can delete their own property notes"
  on public.property_notes;


-- All signed-in workspace users can read all notes.
create policy "Authenticated users can read shared property notes"
on public.property_notes
for select
to authenticated
using (true);


-- A signed-in user may add a note only as themselves and only to an ACTIVE
-- (non-archived) property.
create policy "Authenticated users can add shared property notes"
on public.property_notes
for insert
to authenticated
with check (
  (select auth.uid()) = author_user_id
  and exists (
    select 1
    from public.properties p
    where p.id = property_id
      and p.deleted_at is null
  )
);


-- A user may delete only a note they authored.
create policy "Authenticated users can delete their own property notes"
on public.property_notes
for delete
to authenticated
using (
  (select auth.uid()) = author_user_id
);


-- ============================================================================
-- END
-- ============================================================================
