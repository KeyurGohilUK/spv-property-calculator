-- SPV Property Calculator — Update 21: Task Discussions
-- Run after Update 20. Safe to re-run; existing data is unchanged.
begin;

create table if not exists public.task_comments (
  id text primary key,
  task_id text not null references public.tasks(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  display_name text not null default '',
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists task_comments_task_idx on public.task_comments(task_id);
create index if not exists task_comments_created_idx on public.task_comments(created_at);
alter table public.task_comments enable row level security;
revoke all on table public.task_comments from anon;
revoke insert, update, delete on table public.task_comments from authenticated;
grant select on table public.task_comments to authenticated;

drop policy if exists "Members read task comments" on public.task_comments;
create policy "Members read task comments" on public.task_comments for select to authenticated
using (public.is_workspace_member());

create or replace function public.insert_task_comment(
 p_id text,p_task_id text,p_display_name text,p_message text,p_created_at timestamptz)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.is_workspace_editor() then raise exception 'Approved editor access is required'; end if;
 if nullif(btrim(p_id),'') is null then raise exception 'Comment ID is required'; end if;
 if nullif(btrim(p_task_id),'') is null then raise exception 'Task ID is required'; end if;
 if nullif(btrim(p_message),'') is null then raise exception 'Comment is required'; end if;
 if char_length(btrim(p_message))>2000 then raise exception 'Comment is too long'; end if;
 insert into public.task_comments(id,task_id,user_id,display_name,message,created_at)
 values(p_id,p_task_id,auth.uid(),coalesce(p_display_name,''),btrim(p_message),coalesce(p_created_at,now()))
 on conflict(id) do nothing;
end $$;
revoke all on function public.insert_task_comment(text,text,text,text,timestamptz) from public,anon;
grant execute on function public.insert_task_comment(text,text,text,text,timestamptz) to authenticated;
commit;
