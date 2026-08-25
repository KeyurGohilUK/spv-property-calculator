-- SPV Property Calculator - SHARED workspace with ARCHIVE + PERMANENT DELETE
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

-- Permanent deletion tombstones ------------------------------------------------
-- The property row/data is actually deleted. This tiny table retains only the
-- property ID and deletion time so another user's offline cache cannot recreate it.
create table if not exists public.property_deletions (
  id text primary key,
  deleted_at timestamptz not null default now(),
  deleted_by uuid default auth.uid() references auth.users(id) on delete set null
);

alter table public.property_deletions enable row level security;
revoke all on table public.property_deletions from anon;
revoke all on table public.property_deletions from authenticated;
grant select on table public.property_deletions to authenticated;

drop policy if exists "Authenticated users can read permanent deletions" on public.property_deletions;
create policy "Authenticated users can read permanent deletions"
on public.property_deletions for select to authenticated using (true);

-- One atomic RPC performs both operations: record a tombstone, then delete the
-- property row. Direct DELETE on public.properties remains unavailable to clients.
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

  -- Permanent deletion is deliberately limited to properties that have already
  -- been soft-deleted/archived. Lock the row during this transaction so it cannot
  -- be restored at the same moment it is being purged.
  perform 1 from public.properties
  where id = p_id and deleted_at is not null
  for update;
  if not found then
    raise exception 'Only archived properties can be permanently deleted';
  end if;

  insert into public.property_deletions (id, deleted_at, deleted_by)
  values (p_id, now(), auth.uid())
  on conflict (id) do update
    set deleted_at = excluded.deleted_at,
        deleted_by = excluded.deleted_by;

  delete from public.properties where id = p_id;
end;
$$;

revoke all on function public.permanently_delete_property(text) from public;
revoke all on function public.permanently_delete_property(text) from anon;
grant execute on function public.permanently_delete_property(text) to authenticated;



-- Shared property notes -------------------------------------------------------
-- Notes are append-only from the browser app. Each note keeps the author's
-- display name as a snapshot so the history remains clear even if they rename
-- their account later.
create table if not exists public.property_notes (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references public.properties(id) on delete cascade,
  author_user_id uuid default auth.uid() references auth.users(id) on delete set null,
  author_name text not null check (char_length(btrim(author_name)) between 1 and 120),
  note text not null check (char_length(btrim(note)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists property_notes_property_created_idx
  on public.property_notes (property_id, created_at desc);

alter table public.property_notes enable row level security;

drop policy if exists "Authenticated users can read shared property notes" on public.property_notes;
drop policy if exists "Authenticated users can add shared property notes" on public.property_notes;

create policy "Authenticated users can read shared property notes"
  on public.property_notes
  for select
  to authenticated
  using (true);

create policy "Authenticated users can add shared property notes"
  on public.property_notes
  for insert
  to authenticated
  with check (
    auth.uid() = author_user_id
    and exists (
      select 1 from public.properties p
      where p.id = property_id
        and p.deleted_at is null
    )
  );

revoke all on public.property_notes from anon;
revoke all on public.property_notes from authenticated;
grant select, insert on public.property_notes to authenticated;
