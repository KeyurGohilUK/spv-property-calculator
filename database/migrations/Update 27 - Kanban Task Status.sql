-- Update 27: Add Resolved task status for the four-column Kanban board.
-- Additive, safe to re-run; preserves existing tasks and events.
begin;

alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('todo', 'in-progress', 'resolved', 'done'));

alter table public.task_events drop constraint if exists task_events_from_status_check;
alter table public.task_events add constraint task_events_from_status_check
  check (from_status in ('todo', 'in-progress', 'resolved', 'done'));

alter table public.task_events drop constraint if exists task_events_to_status_check;
alter table public.task_events add constraint task_events_to_status_check
  check (to_status in ('todo', 'in-progress', 'resolved', 'done'));

-- Maintain the existing conflict-safe RPC signature and permissions.
create or replace function public.upsert_task_if_current(
 p_id text,p_title text,p_description text,p_status text,p_created_by uuid,p_assigned_to uuid,
 p_due_date date,p_scope text,p_property_id text,p_deleted_at timestamptz,p_expected_revision bigint)
returns table(new_revision bigint,server_created_at timestamptz,server_updated_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_now timestamptz:=now();
begin
 if auth.uid() is null or not public.is_workspace_editor() then raise exception 'Approved editor access is required'; end if;
 if nullif(btrim(p_id),'') is null then raise exception 'Task ID is required'; end if;
 if nullif(btrim(p_title),'') is null then raise exception 'Task title is required'; end if;
 if p_status not in ('todo','in-progress','resolved','done') then raise exception 'Invalid task status'; end if;
 if p_scope not in ('company','property') then raise exception 'Invalid task scope'; end if;
 if (p_scope='company' and p_property_id is not null)
    or (p_scope='property' and nullif(btrim(p_property_id),'') is null) then
  raise exception 'Task property does not match its scope';
 end if;
 if p_expected_revision is null or p_expected_revision<0 then raise exception 'Expected revision must be zero or greater'; end if;
 if p_assigned_to is not null and not exists(
   select 1 from public.workspace_members where user_id=p_assigned_to and active
 ) then raise exception 'Assignee must be an active workspace member'; end if;
 if p_expected_revision=0 then
  insert into public.tasks(id,user_id,title,description,status,created_by,assigned_to,due_date,scope,property_id,created_at,updated_at,deleted_at,revision)
  values(p_id,auth.uid(),coalesce(p_title,''),coalesce(p_description,''),coalesce(p_status,'todo'),
   p_created_by,p_assigned_to,p_due_date,coalesce(p_scope,'company'),nullif(p_property_id,''),v_now,v_now,p_deleted_at,1)
  on conflict(id) do nothing
  returning tasks.revision,tasks.created_at,tasks.updated_at into new_revision,server_created_at,server_updated_at;
 else
  update public.tasks set title=coalesce(p_title,''),description=coalesce(p_description,''),
   status=coalesce(p_status,'todo'),assigned_to=p_assigned_to,due_date=p_due_date,scope=coalesce(p_scope,'company'),
   property_id=nullif(p_property_id,''),deleted_at=p_deleted_at,updated_at=v_now,revision=revision+1
  where id=p_id and revision=p_expected_revision
  returning tasks.revision,tasks.created_at,tasks.updated_at into new_revision,server_created_at,server_updated_at;
 end if;
 if new_revision is null then raise exception using errcode='40001',message='TASK_CONFLICT: this task changed on another device'; end if;
 return next;
end $$;
revoke all on function public.upsert_task_if_current(text,text,text,text,uuid,uuid,date,text,text,timestamptz,bigint) from public,anon;
grant execute on function public.upsert_task_if_current(text,text,text,text,uuid,uuid,date,text,text,timestamptz,bigint) to authenticated;

commit;

-- Verification (no data changes):
-- select conname from pg_constraint where conrelid in ('public.tasks'::regclass, 'public.task_events'::regclass)
--   and conname in ('tasks_status_check', 'task_events_from_status_check', 'task_events_to_status_check');
