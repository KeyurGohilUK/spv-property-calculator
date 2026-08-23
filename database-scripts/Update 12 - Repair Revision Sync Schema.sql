-- ============================================================================
-- Update 12 - Repair revision columns for conflict-safe sync
--
-- Safe to re-run. This migration preserves all existing properties and expenses.
-- It repairs databases where later app releases were deployed before Update 9.
-- ============================================================================

begin;

alter table public.properties
  add column if not exists revision bigint;

update public.properties
set revision = 1
where revision is null or revision < 1;

alter table public.properties
  alter column revision set default 1,
  alter column revision set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.properties'::regclass
      and conname = 'properties_revision_check'
  ) then
    alter table public.properties
      add constraint properties_revision_check check (revision >= 1);
  end if;
end $$;

-- Repair expenses defensively as both resources use the same revision protocol.
alter table public.expenses
  add column if not exists revision bigint;

update public.expenses
set revision = 1
where revision is null or revision < 1;

alter table public.expenses
  alter column revision set default 1,
  alter column revision set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.expenses'::regclass
      and conname = 'expenses_revision_check'
  ) then
    alter table public.expenses
      add constraint expenses_revision_check check (revision >= 1);
  end if;
end $$;

create or replace function public.upsert_property_if_current(
  p_id text,
  p_data jsonb,
  p_created_at timestamptz,
  p_deleted_at timestamptz,
  p_expected_revision bigint
)
returns table(
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

  if p_expected_revision = 0 then
    insert into public.properties(
      id, user_id, data, created_at, updated_at, deleted_at, revision
    )
    values(
      p_id,
      auth.uid(),
      coalesce(p_data, '{}'::jsonb),
      coalesce(p_created_at, v_now),
      v_now,
      p_deleted_at,
      1
    )
    on conflict (id) do nothing
    returning revision, created_at, updated_at
      into new_revision, server_created_at, server_updated_at;
  else
    update public.properties
    set data = coalesce(p_data, '{}'::jsonb),
        updated_at = v_now,
        deleted_at = p_deleted_at,
        revision = revision + 1
    where id = p_id
      and revision = p_expected_revision
    returning revision, created_at, updated_at
      into new_revision, server_created_at, server_updated_at;
  end if;

  if new_revision is null then
    raise exception using
      errcode = '40001',
      message = 'PROPERTY_CONFLICT: this property changed on another device';
  end if;

  return next;
end
$$;

revoke all on function public.upsert_property_if_current(
  text, jsonb, timestamptz, timestamptz, bigint
) from public, anon;

grant execute on function public.upsert_property_if_current(
  text, jsonb, timestamptz, timestamptz, bigint
) to authenticated;

commit;

-- Verification: both values should be bigint, non-nullable, with default 1.
select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('properties', 'expenses')
  and column_name = 'revision'
order by table_name;
