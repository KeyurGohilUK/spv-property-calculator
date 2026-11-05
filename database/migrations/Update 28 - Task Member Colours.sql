-- Update 28: administrator-controlled task card colours for workspace members.
-- Existing assignments and tasks are unchanged.
begin;

alter table public.workspace_members
  add column if not exists task_color text null;

alter table public.workspace_members
  drop constraint if exists workspace_members_task_color_check;
alter table public.workspace_members
  add constraint workspace_members_task_color_check
    check (task_color is null or task_color in ('blue','rose','mint','amber','violet','teal'));

-- Return the palette token to every approved member, without exposing account emails.
drop function if exists public.list_active_members();
create function public.list_active_members()
returns table(user_id uuid, display_name text, task_color text)
language plpgsql security definer set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_workspace_member() then
    raise exception 'Workspace member access is required';
  end if;
  return query
    select account.id,
      coalesce(nullif(account.raw_user_meta_data->>'display_name',''),
               nullif(account.raw_user_meta_data->>'full_name',''),
               split_part(coalesce(account.email,''),'@',1))::text,
      member.task_color
    from auth.users account
    join public.workspace_members member on member.user_id = account.id
    where member.active = true
    order by lower(coalesce(nullif(account.raw_user_meta_data->>'display_name',''),account.email,''));
end;
$$;
revoke all on function public.list_active_members() from public, anon;
grant execute on function public.list_active_members() to authenticated;

-- A security-definer RPC prevents editors or viewers altering any member's colour.
create or replace function public.set_task_member_color(p_user_id uuid, p_color text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_workspace_admin() then
    raise exception 'Administrator access is required';
  end if;
  if p_color is not null and p_color not in ('blue','rose','mint','amber','violet','teal') then
    raise exception 'Invalid task colour';
  end if;
  update public.workspace_members set task_color = p_color
  where user_id = p_user_id and active = true;
  if not found then raise exception 'Active workspace member not found'; end if;
end;
$$;
revoke all on function public.set_task_member_color(uuid,text) from public,anon;
grant execute on function public.set_task_member_color(uuid,text) to authenticated;

commit;
