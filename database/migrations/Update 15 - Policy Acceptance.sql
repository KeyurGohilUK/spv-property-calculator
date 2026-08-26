-- Update 15 - Versioned legal policy acceptance
-- Run once after Update 14 and before deploying app version 1.21.44.

begin;

create table if not exists public.policy_acceptances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  disclaimer_version text not null,
  accepted_at timestamptz not null default now()
);

alter table public.policy_acceptances enable row level security;

revoke all on table public.policy_acceptances from public, anon;
revoke all on table public.policy_acceptances from authenticated;
grant select, insert, update on table public.policy_acceptances to authenticated;

drop policy if exists "Users read own policy acceptance" on public.policy_acceptances;
create policy "Users read own policy acceptance"
on public.policy_acceptances for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users create own policy acceptance" on public.policy_acceptances;
create policy "Users create own policy acceptance"
on public.policy_acceptances for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users update own policy acceptance" on public.policy_acceptances;
create policy "Users update own policy acceptance"
on public.policy_acceptances for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop function if exists public.list_workspace_users();
create function public.list_workspace_users()
returns table(
  user_id uuid,
  email text,
  display_name text,
  role text,
  active boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  policy_accepted_at timestamptz,
  terms_version text,
  privacy_version text,
  disclaimer_version text
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
    account.last_sign_in_at,
    acceptance.accepted_at,
    acceptance.terms_version,
    acceptance.privacy_version,
    acceptance.disclaimer_version
  from auth.users account
  left join public.workspace_members member on member.user_id = account.id
  left join public.policy_acceptances acceptance on acceptance.user_id = account.id
  order by coalesce(member.active, false) desc, lower(coalesce(account.email, ''));
end;
$$;

revoke all on function public.list_workspace_users() from public, anon;
grant execute on function public.list_workspace_users() to authenticated;

commit;

select schemaname, tablename, rowsecurity
from pg_catalog.pg_tables
where schemaname = 'public' and tablename = 'policy_acceptances';

select policyname, cmd
from pg_catalog.pg_policies
where schemaname = 'public' and tablename = 'policy_acceptances'
order by policyname;
