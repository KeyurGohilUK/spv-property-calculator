-- ============================================================================
-- SPV Property Calculator
-- Update 18: Task Status History
--
-- Run after Update 17 on an existing Supabase project.
-- Safe to re-run. No existing data is changed.
-- ============================================================================

begin;

create table if not exists public.task_events (
  id text primary key,
  task_id text not null references public.tasks(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  display_name text not null default '',
  from_status text null check (from_status in ('todo', 'in-progress', 'done')),
  to_status text null check (to_status in ('todo', 'in-progress', 'done')),
  created_at timestamptz not null default now()
);

create index if not exists task_events_task_idx on public.task_events(task_id);
create index if not exists task_events_created_idx on public.task_events(created_at);

alter table public.task_events enable row level security;
revoke all on table public.task_events from anon;
revoke insert, update, delete on table public.task_events from authenticated;
grant select on table public.task_events to authenticated;

drop policy if exists "Members read task events" on public.task_events;
create policy "Members read task events"
on public.task_events
for select
to authenticated
using (public.is_workspace_member());

create or replace function public.insert_task_event(
  p_id text,
  p_task_id text,
  p_display_name text,
  p_from_status text,
  p_to_status text,
  p_created_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_workspace_editor() then
    raise exception 'Approved editor access is required';
  end if;
  if nullif(btrim(p_id), '') is null then raise exception 'Event ID is required'; end if;
  if nullif(btrim(p_task_id), '') is null then raise exception 'Task ID is required'; end if;

  insert into public.task_events (id, task_id, user_id, display_name, from_status, to_status, created_at)
  values (
    p_id,
    p_task_id,
    auth.uid(),
    coalesce(p_display_name, ''),
    p_from_status,
    p_to_status,
    coalesce(p_created_at, now())
  )
  on conflict (id) do nothing;
end;
$$;

revoke all on function public.insert_task_event(text, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.insert_task_event(text, text, text, text, text, timestamptz) to authenticated;

commit;

-- Verification:
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'task_events'
-- order by ordinal_position;
