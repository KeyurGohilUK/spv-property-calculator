-- Update 26 — Multiple company profiles.
-- Preserves the existing 'default' row and its existing RPC unchanged.
begin;

alter table public.company_profiles
  drop constraint if exists company_profiles_id_check;
-- The original inline CHECK is usually named company_profiles_id_check.
alter table public.company_profiles
  add constraint company_profiles_id_check
  check (id = 'default' or id ~ '^company-[A-Za-z0-9_-]{8,80}$');

create or replace function public.upsert_company_profile_by_id_if_current(
  p_id text, p_details jsonb, p_expected_revision bigint
)
returns table(new_revision bigint, server_updated_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not public.is_workspace_editor() then
    raise exception 'Approved editor access is required';
  end if;
  if p_id is null or (p_id <> 'default' and p_id !~ '^company-[A-Za-z0-9_-]{8,80}$') then
    raise exception 'Invalid company identifier';
  end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object'
     or nullif(btrim(p_details->>'companyName'), '') is null then
    raise exception 'Company name is required';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Expected revision must be non-negative';
  end if;

  if p_expected_revision = 0 then
    insert into public.company_profiles(id, details, updated_at, revision)
    values (p_id, p_details, now(), 1)
    on conflict (id) do nothing
    returning company_profiles.revision, company_profiles.updated_at
      into new_revision, server_updated_at;
  else
    update public.company_profiles
       set details = p_details, updated_at = now(), revision = revision + 1
     where id = p_id and revision = p_expected_revision
    returning company_profiles.revision, company_profiles.updated_at
      into new_revision, server_updated_at;
  end if;
  if new_revision is null then
    raise exception using errcode = '40001',
      message = 'COMPANY_PROFILE_CONFLICT: company details changed on another device';
  end if;
  return next;
end $$;

revoke all on function public.upsert_company_profile_by_id_if_current(text,jsonb,bigint) from public, anon;
grant execute on function public.upsert_company_profile_by_id_if_current(text,jsonb,bigint) to authenticated;
commit;

-- Verification:
-- select id, details->>'companyName', revision from public.company_profiles;
-- select proname from pg_proc where proname='upsert_company_profile_by_id_if_current';
