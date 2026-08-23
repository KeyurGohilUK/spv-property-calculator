-- ============================================================================
-- SPV Property Calculator - Workspace access-control upgrade
-- Update 8: approved members + admin-only permanent deletion
--
-- Run this whole file in Supabase SQL Editor.
--
-- Safe defaults:
-- - The oldest existing Auth account becomes the initial workspace administrator.
-- - Other existing and future Auth accounts receive NO property access until added.
-- - Existing property and note data is preserved.
-- - Re-running this migration is safe.
-- ============================================================================

begin;

-- ============================================================================
-- 1. APPROVED WORKSPACE MEMBERS
-- ============================================================================

create table if not exists public.workspace_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'editor'
    check (role in ('viewer', 'editor', 'admin')),
  active boolean not null default true,
  added_at timestamptz not null default now(),
  added_by uuid null references auth.users(id) on delete set null
);

alter table public.workspace_members enable row level security;

revoke all on table public.workspace_members from anon;
revoke all on table public.workspace_members from authenticated;
grant select on table public.workspace_members to authenticated;

-- Bootstrap exactly one administrator when the membership table is empty.
-- The oldest Auth account is normally the Supabase project owner / first app user.
insert into public.workspace_members (user_id, role, active)
select users.id, 'admin', true
from auth.users users
where not exists (select 1 from public.workspace_members)
order by users.created_at asc
limit 1
on conflict (user_id) do nothing;

do $$
begin
  if not exists (
    select 1 from public.workspace_members
    where role = 'admin' and active = true
  ) then
    raise exception
      'No active workspace administrator exists. Create/sign in with the owner account before applying Update 8.';
  end if;
end;
$$;

drop policy if exists "Members can read own workspace membership"
  on public.workspace_members;

create policy "Members can read own workspace membership"
on public.workspace_members
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Security-definer helpers avoid recursive RLS checks and expose only booleans.
create or replace function public.is_workspace_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.workspace_members
    where user_id = auth.uid()
      and active = true
  );
$$;

create or replace function public.is_workspace_editor()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.workspace_members
    where user_id = auth.uid()
      and active = true
      and role in ('editor', 'admin')
  );
$$;

create or replace function public.is_workspace_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.workspace_members
    where user_id = auth.uid()
      and active = true
      and role = 'admin'
  );
$$;

revoke all on function public.is_workspace_member() from public, anon;
revoke all on function public.is_workspace_editor() from public, anon;
revoke all on function public.is_workspace_admin() from public, anon;
grant execute on function public.is_workspace_member() to authenticated;
grant execute on function public.is_workspace_editor() to authenticated;
grant execute on function public.is_workspace_admin() to authenticated;

-- ============================================================================
-- 2. PROPERTY ACCESS
-- ============================================================================

drop policy if exists "Authenticated users can read shared properties"
  on public.properties;
drop policy if exists "Authenticated users can insert shared properties"
  on public.properties;
drop policy if exists "Authenticated users can update shared properties"
  on public.properties;

create policy "Approved members can read shared properties"
on public.properties
for select
to authenticated
using ((select public.is_workspace_member()));

create policy "Approved editors can insert shared properties"
on public.properties
for insert
to authenticated
with check (
  (select public.is_workspace_editor())
  and (select auth.uid()) = user_id
);

create policy "Approved editors can update shared properties"
on public.properties
for update
to authenticated
using ((select public.is_workspace_editor()))
with check ((select public.is_workspace_editor()));

-- ============================================================================
-- 3. PERMANENT-DELETION TOMBSTONES
-- ============================================================================

drop policy if exists "Authenticated users can read permanent deletions"
  on public.property_deletions;

create policy "Approved members can read permanent deletions"
on public.property_deletions
for select
to authenticated
using ((select public.is_workspace_member()));

-- ============================================================================
-- 4. ADMIN-ONLY PERMANENT DELETE
-- ============================================================================

create or replace function public.permanently_delete_property(p_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_workspace_admin() then
    raise exception 'Only a workspace administrator can permanently delete properties';
  end if;

  perform 1
  from public.properties
  where id = p_id
    and deleted_at is not null
  for update;

  if not found then
    raise exception 'Only archived properties can be permanently deleted';
  end if;

  insert into public.property_deletions (id, deleted_at, deleted_by)
  values (p_id, now(), auth.uid())
  on conflict (id)
  do update set
    deleted_at = excluded.deleted_at,
    deleted_by = excluded.deleted_by;

  delete from public.properties
  where id = p_id;
end;
$$;

revoke all on function public.permanently_delete_property(text)
from public, anon;
grant execute on function public.permanently_delete_property(text)
to authenticated;

-- ============================================================================
-- 5. SHARED NOTE ACCESS
-- ============================================================================

drop policy if exists "Authenticated users can read shared property notes"
  on public.property_notes;
drop policy if exists "Authenticated users can add shared property notes"
  on public.property_notes;
drop policy if exists "Authenticated users can delete their own property notes"
  on public.property_notes;

create policy "Approved members can read shared property notes"
on public.property_notes
for select
to authenticated
using ((select public.is_workspace_member()));

create policy "Approved editors can add shared property notes"
on public.property_notes
for insert
to authenticated
with check (
  (select public.is_workspace_editor())
  and (select auth.uid()) = author_user_id
  and exists (
    select 1
    from public.properties property
    where property.id = property_id
      and property.deleted_at is null
  )
);

create policy "Approved editors can delete their own property notes"
on public.property_notes
for delete
to authenticated
using (
  (select public.is_workspace_editor())
  and (select auth.uid()) = author_user_id
);

commit;

-- ============================================================================
-- MEMBER ADMINISTRATION (run manually in Supabase SQL Editor)
-- ============================================================================
--
-- Review current members:
--
-- select
--   users.email,
--   members.role,
--   members.active,
--   members.added_at
-- from public.workspace_members members
-- join auth.users users on users.id = members.user_id
-- order by members.added_at;
--
-- Add an approved editor by their existing Auth email:
--
-- insert into public.workspace_members (user_id, role, active)
-- select id, 'editor', true
-- from auth.users
-- where lower(email) = lower('partner@example.com')
-- on conflict (user_id)
-- do update set role = excluded.role, active = true;
--
-- Disable access without deleting the Auth account:
--
-- update public.workspace_members
-- set active = false
-- where user_id = (
--   select id from auth.users where lower(email) = lower('person@example.com')
-- );
