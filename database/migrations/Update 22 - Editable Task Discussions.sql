-- SPV Property Calculator — Update 22: Editable Task Discussions
-- Run after Update 21. Safe to re-run; existing comments are preserved.
begin;

alter table public.task_comments
  add column if not exists updated_at timestamptz;

update public.task_comments
set updated_at = created_at
where updated_at is null;

alter table public.task_comments
  alter column updated_at set default now();

alter table public.task_comments
  alter column updated_at set not null;

create or replace function public.upsert_task_comment(
 p_id text,p_task_id text,p_display_name text,p_message text,p_created_at timestamptz)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_existing_user uuid;
begin
 if auth.uid() is null or not public.is_workspace_editor() then raise exception 'Approved editor access is required'; end if;
 if nullif(btrim(p_id),'') is null then raise exception 'Comment ID is required'; end if;
 if nullif(btrim(p_task_id),'') is null then raise exception 'Task ID is required'; end if;
 if nullif(btrim(p_message),'') is null then raise exception 'Comment is required'; end if;
 if char_length(btrim(p_message))>2000 then raise exception 'Comment is too long'; end if;

 select user_id into v_existing_user
 from public.task_comments
 where id=p_id
 for update;

 if found then
  if v_existing_user is distinct from auth.uid() then raise exception 'You can only edit your own comments'; end if;
  update public.task_comments
  set message=btrim(p_message),updated_at=now()
  where id=p_id;
 else
  insert into public.task_comments(id,task_id,user_id,display_name,message,created_at,updated_at)
  values(p_id,p_task_id,auth.uid(),coalesce(p_display_name,''),btrim(p_message),coalesce(p_created_at,now()),now());
 end if;
end $$;

revoke all on function public.upsert_task_comment(text,text,text,text,timestamptz) from public,anon;
grant execute on function public.upsert_task_comment(text,text,text,text,timestamptz) to authenticated;

commit;
