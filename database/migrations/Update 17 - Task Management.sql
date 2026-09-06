-- ============================================================================
-- SPV Property Calculator
-- Update 17: Task Management
--
-- Run after Update 16 on an existing Supabase project.
-- Safe to re-run. No existing data is changed.
-- ============================================================================

begin;

create table if not exists public.tasks (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  title text not null default '',
  description text not null default '',
  status text not null default 'todo' check (status in ('todo', 'in-progress', 'done')),
  created_by uuid null references auth.users(id) on delete set null,
  due_date date null,
  scope text not null default 'company' check (scope in ('company', 'property')),
  property_id text null references public.properties(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  revision bigint not null default 1 check (revision >= 1),
  constraint tasks_scope_property_check check (
    (scope = 'company' and property_id is null)
    or (scope = 'property' and property_id is not null)
  )
);

create index if not exists tasks_status_idx on public.tasks(status);
create index if not exists tasks_updated_idx on public.tasks(updated_at desc);
create index if not exists tasks_due_date_idx on public.tasks(due_date) where due_date is not null;
create index if not exists tasks_property_idx on public.tasks(property_id) where property_id is not null;

alter table public.tasks enable row level security;
revoke all on table public.tasks from anon;
revoke insert, update, delete on table public.tasks from authenticated;
grant select on table public.tasks to authenticated;

drop policy if exists "Members read tasks" on public.tasks;
create policy "Members read tasks"
on public.tasks
for select
to authenticated
using ((select public.is_workspace_member()));

create or replace function public.upsert_task_if_current(
  p_id text,
  p_title text,
  p_description text,
  p_status text,
  p_created_by uuid,
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

  if p_expected_revision = 0 then
    insert into public.tasks (
      id, user_id, title, description, status, created_by,
      due_date, scope, property_id, created_at, updated_at, deleted_at, revision
    ) values (
      p_id, auth.uid(), coalesce(p_title, ''), coalesce(p_description, ''),
      coalesce(p_status, 'todo'), p_created_by,
      p_due_date, coalesce(p_scope, 'company'), nullif(p_property_id, ''),
      v_now, v_now, p_deleted_at, 1
    )
    on conflict (id) do nothing
    returning tasks.revision, tasks.created_at, tasks.updated_at
    into new_revision, server_created_at, server_updated_at;
  else
    update public.tasks
    set title = coalesce(p_title, ''),
        description = coalesce(p_description, ''),
        status = coalesce(p_status, 'todo'),
        due_date = p_due_date,
        scope = coalesce(p_scope, 'company'),
        property_id = nullif(p_property_id, ''),
        deleted_at = p_deleted_at,
        updated_at = v_now,
        revision = revision + 1
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
  text, text, text, text, uuid, date, text, text, timestamptz, bigint
) from public, anon;
grant execute on function public.upsert_task_if_current(
  text, text, text, text, uuid, date, text, text, timestamptz, bigint
) to authenticated;

commit;

-- Verification:
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'tasks'
-- order by ordinal_position;
