-- Update 13 - Admin user management
-- Run once after Update 12. This migration is immutable once deployed.

begin;

create or replace function public.list_workspace_users()
returns table(
  user_id uuid,
  email text,
  display_name text,
  role text,
  active boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_workspace_admin() then
    raise exception 'Administrator access is required';
  end if;

  return query
  select
    account.id,
    account.email::text,
    coalesce(
      nullif(account.raw_user_meta_data ->> 'display_name', ''),
      nullif(account.raw_user_meta_data ->> 'full_name', ''),
      split_part(coalesce(account.email, ''), '@', 1)
    )::text,
    member.role::text,
    coalesce(member.active, false),
    account.created_at,
    account.last_sign_in_at
  from auth.users account
  left join public.workspace_members member on member.user_id = account.id
  order by coalesce(member.active, false) desc, lower(coalesce(account.email, ''));
end;
$$;

create or replace function public.set_workspace_user_access(
  p_user_id uuid,
  p_role text,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_workspace_admin() then
    raise exception 'Administrator access is required';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User account was not found';
  end if;
  if p_role not in ('viewer', 'editor', 'admin') then
    raise exception 'Role must be viewer, editor or admin';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Administrators cannot change their own access';
  end if;

  insert into public.workspace_members (user_id, role, active)
  values (p_user_id, p_role, p_active)
  on conflict (user_id) do update
    set role = excluded.role,
        active = excluded.active;
end;
$$;

revoke all on function public.list_workspace_users() from public, anon;
revoke all on function public.set_workspace_user_access(uuid, text, boolean) from public, anon;
grant execute on function public.list_workspace_users() to authenticated;
grant execute on function public.set_workspace_user_access(uuid, text, boolean) to authenticated;

commit;

-- Verification: both RPCs should be security-definer functions owned by the
-- database role that deployed this migration.
select
  routine_name,
  security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('list_workspace_users', 'set_workspace_user_access')
order by routine_name;
