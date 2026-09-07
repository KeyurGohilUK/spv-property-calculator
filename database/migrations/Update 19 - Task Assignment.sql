-- ============================================================================
-- SPV Property Calculator
-- Update 19: Task Assignment
--
-- Run after Update 18 on an existing Supabase project.
-- Safe to re-run. No existing data is changed.
-- ============================================================================

begin;

-- Add assigned_to column to tasks
alter table public.tasks
  add column if not exists assigned_to uuid null references auth.users(id) on delete set null;

create index if not exists tasks_assigned_idx on public.tasks(assigned_to) where assigned_to is not null;

-- Member-accessible function to list active workspace members for the assignee picker.
-- Intentionally lighter than list_workspace_users (no policy data, no role) and available
-- to all workspace members, not just admins.
create or replace function public.list_active_members()
returns table(user_id uuid, display_name text)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_workspace_member() then
    raise exception 'Workspace member access is required';
  end if;
  return query
  select
    account.id,
    coalesce(
      nullif(account.raw_user_meta_data->>'display_name', ''),
      nullif(account.raw_user_meta_data->>'full_name', ''),
      split_part(coalesce(account.email, ''), '@', 1)
    )::text
  from auth.users account
  join public.workspace_members member on member.user_id = account.id
  where member.active = true
  order by lower(coalesce(
    nullif(account.raw_user_meta_data->>'display_name', ''),
    account.email, ''));
end;
$$;

revoke all on function public.list_active_members() from public, anon;
grant execute on function public.list_active_members() to authenticated;

-- Recreate upsert_task_if_current with the new p_assigned_to parameter.
-- The old signature (without assigned_to) is dropped first.
drop function if exists public.upsert_task_if_current(
  text, text, text, text, uuid, date, text, text, timestamptz, bigint
);

create or replace function public.upsert_task_if_current(
  p_id text,
  p_title text,
  p_description text,
  p_status text,
  p_created_by uuid,
  p_assigned_to uuid,
  p_due_date date,
  p_scope text,
  p_property_id text,
  p_deleted_at timestamptz,
  p_expected_revision bigint
)
returns table (
  new_revision bigint,
  server_created_at timestamptz,
  server_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
begin
  if auth.uid() is null or not public.is_workspace_editor() then
    raise exception 'Approved editor access is required';
  end if;
  if nullif(btrim(p_id), '') is null then raise exception 'Task ID is required'; end if;
  if nullif(btrim(p_title), '') is null then raise exception 'Task title is required'; end if;
  if p_status not in ('todo', 'in-progress', 'done') then raise exception 'Invalid task status'; end if;
  if p_scope not in ('company', 'property') then raise exception 'Invalid task scope'; end if;
  if (p_scope = 'company' and p_property_id is not null)
     or (p_scope = 'property' and nullif(btrim(p_property_id), '') is null) then
    raise exception 'Task property does not match its scope';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Expected revision must be zero or greater';
  end if;
  if p_assigned_to is not null and not exists (
    select 1 from public.workspace_members where user_id = p_assigned_to and active
  ) then
    raise exception 'Assignee must be an active workspace member';
  end if;

  if p_expected_revision = 0 then
    insert into public.tasks (
      id, user_id, title, description, status, created_by, assigned_to,
      due_date, scope, property_id, created_at, updated_at, deleted_at, revision
    ) values (
      p_id, auth.uid(), coalesce(p_title, ''), coalesce(p_description, ''),
      coalesce(p_status, 'todo'), p_created_by, p_assigned_to,
      p_due_date, coalesce(p_scope, 'company'), nullif(p_property_id, ''),
      v_now, v_now, p_deleted_at, 1
    )
    on conflict (id) do nothing
    returning tasks.revision, tasks.created_at, tasks.updated_at
    into new_revision, server_created_at, server_updated_at;
  else
    update public.tasks
    set title       = coalesce(p_title, ''),
        description = coalesce(p_description, ''),
        status      = coalesce(p_status, 'todo'),
        assigned_to = p_assigned_to,
        due_date    = p_due_date,
        scope       = coalesce(p_scope, 'company'),
        property_id = nullif(p_property_id, ''),
        deleted_at  = p_deleted_at,
        updated_at  = v_now,
        revision    = revision + 1
    where id = p_id and revision = p_expected_revision
    returning tasks.revision, tasks.created_at, tasks.updated_at
    into new_revision, server_created_at, server_updated_at;
  end if;

  if new_revision is null then
    raise exception using errcode = '40001',
      message = 'TASK_CONFLICT: this task changed on another device';
  end if;
  return next;
end;
$$;

revoke all on function public.upsert_task_if_current(
  text, text, text, text, uuid, uuid, date, text, text, timestamptz, bigint
) from public, anon;
grant execute on function public.upsert_task_if_current(
  text, text, text, text, uuid, uuid, date, text, text, timestamptz, bigint
) to authenticated;

commit;

-- Verification:
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'tasks'
-- order by ordinal_position;
