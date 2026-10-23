-- SPV Property Calculator — Update 24: Company particulars and appointments
-- Run after Update 23. Stores one workspace company profile and appointment register.
begin;

create table if not exists public.company_profiles (
  id text primary key check (id = 'default'),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision >= 1)
);

alter table public.company_profiles enable row level security;
revoke all on table public.company_profiles from anon, authenticated;
grant select on table public.company_profiles to authenticated;

drop policy if exists "Members read company profile" on public.company_profiles;
create policy "Members read company profile" on public.company_profiles
  for select to authenticated using (public.is_workspace_member());

create or replace function public.upsert_company_profile_if_current(
  p_details jsonb,
  p_expected_revision bigint
)
returns table(new_revision bigint, server_updated_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_workspace_editor() then
    raise exception 'Approved editor access is required';
  end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'Company details must be a JSON object';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Expected revision must be zero or greater';
  end if;

  if p_expected_revision = 0 then
    insert into public.company_profiles(id, details, updated_at, revision)
    values ('default', p_details, now(), 1)
    on conflict (id) do nothing
    returning public.company_profiles.revision, public.company_profiles.updated_at
      into new_revision, server_updated_at;
  else
    update public.company_profiles
    set details = p_details,
        updated_at = now(),
        revision = revision + 1
    where id = 'default' and revision = p_expected_revision
    returning public.company_profiles.revision, public.company_profiles.updated_at
      into new_revision, server_updated_at;
  end if;

  if new_revision is null then
    raise exception using errcode = '40001',
      message = 'COMPANY_PROFILE_CONFLICT: company details changed on another device';
  end if;
  return next;
end;
$$;

revoke all on function public.upsert_company_profile_if_current(jsonb, bigint) from public, anon;
grant execute on function public.upsert_company_profile_if_current(jsonb, bigint) to authenticated;

commit;

-- Verification:
-- select id, details, revision from public.company_profiles;
-- select policyname, cmd from pg_policies where schemaname='public' and tablename='company_profiles';
