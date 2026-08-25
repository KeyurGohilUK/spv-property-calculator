-- ============================================================================
-- SPV Property Calculator - Optimistic concurrency upgrade
-- Update 9: server revisions + conflict-safe property writes
--
-- Run this whole file in Supabase SQL Editor after Update 8.
-- Existing property and note data is preserved.
-- ============================================================================

begin;

alter table public.properties
  add column if not exists revision bigint not null default 1;

alter table public.properties
  drop constraint if exists properties_revision_positive;

alter table public.properties
  add constraint properties_revision_positive
  check (revision >= 1);

-- Browser clients may read rows directly, but all writes now pass through the
-- revision-checking RPC below. This prevents an older device from bypassing the
-- concurrency check with a direct update.
revoke insert, update on table public.properties from authenticated;
grant select on table public.properties to authenticated;

create or replace function public.upsert_property_if_current(
  p_id text,
  p_data jsonb,
  p_created_at timestamptz,
  p_deleted_at timestamptz,
  p_expected_revision bigint
)
returns table (
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
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_workspace_editor() then
    raise exception 'Approved editor access is required';
  end if;

  if nullif(btrim(p_id), '') is null then
    raise exception 'Property ID is required';
  end if;

  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Expected revision must be zero or greater';
  end if;

  if p_expected_revision = 0 then
    insert into public.properties (
      id,
      user_id,
      data,
      created_at,
      updated_at,
      deleted_at,
      revision
    )
    values (
      p_id,
      auth.uid(),
      coalesce(p_data, '{}'::jsonb),
      coalesce(p_created_at, v_now),
      v_now,
      p_deleted_at,
      1
    )
    on conflict (id) do nothing
    returning
      properties.revision,
      properties.created_at,
      properties.updated_at
    into new_revision, server_created_at, server_updated_at;
  else
    update public.properties
    set
      data = coalesce(p_data, '{}'::jsonb),
      updated_at = v_now,
      deleted_at = p_deleted_at,
      revision = revision + 1
    where id = p_id
      and revision = p_expected_revision
    returning
      properties.revision,
      properties.created_at,
      properties.updated_at
    into new_revision, server_created_at, server_updated_at;
  end if;

  if new_revision is null then
    raise exception using
      errcode = '40001',
      message = 'PROPERTY_CONFLICT: this property changed on another device';
  end if;

  return next;
end;
$$;

revoke all
on function public.upsert_property_if_current(text, jsonb, timestamptz, timestamptz, bigint)
from public, anon;

grant execute
on function public.upsert_property_if_current(text, jsonb, timestamptz, timestamptz, bigint)
to authenticated;

commit;

-- Verification:
--
-- select id, revision, updated_at
-- from public.properties
-- order by updated_at desc;
--
-- Every existing row should have revision 1. New successful cloud writes increase
-- the revision. A write carrying an older expected revision fails with SQLSTATE
-- 40001 rather than overwriting the newer record.
