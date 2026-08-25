-- ============================================================================
-- SPV Property Calculator
-- Update 10: Expense Tracker cloud-ready schema
--
-- Run after Update 9 on an existing Supabase project.
-- Safe to re-run. Existing property and note data is not changed.
-- Receipt files are stored outside this table; receipt_metadata records the
-- file name/type/size and receipt_object_path can reference object storage.
-- ============================================================================

begin;

create table if not exists public.expenses (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  expense_date date not null,
  category text not null,
  scope text not null check (scope in ('company', 'property')),
  property_id text null references public.properties(id) on delete set null,
  description text not null default '',
  notes text not null default '',
  receipt_metadata jsonb null,
  receipt_object_path text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  revision bigint not null default 1 check (revision >= 1),
  constraint expenses_scope_property_check check (
    (scope = 'company' and property_id is null)
    or (scope = 'property' and property_id is not null)
  )
);

create index if not exists expenses_date_idx
  on public.expenses (expense_date desc);
create index if not exists expenses_property_idx
  on public.expenses (property_id)
  where property_id is not null;
create index if not exists expenses_updated_idx
  on public.expenses (updated_at desc);

alter table public.expenses enable row level security;
revoke all on table public.expenses from anon;
revoke insert, update, delete on table public.expenses from authenticated;
grant select on table public.expenses to authenticated;

drop policy if exists "Approved members can read expenses" on public.expenses;
create policy "Approved members can read expenses"
on public.expenses
for select
to authenticated
using ((select public.is_workspace_member()));

create or replace function public.upsert_expense_if_current(
  p_id text,
  p_amount numeric,
  p_expense_date date,
  p_category text,
  p_scope text,
  p_property_id text,
  p_description text,
  p_notes text,
  p_receipt_metadata jsonb,
  p_receipt_object_path text,
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
  if auth.uid() is null or not public.is_workspace_editor() then
    raise exception 'Approved editor access is required';
  end if;
  if nullif(btrim(p_id), '') is null then raise exception 'Expense ID is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Expense amount must be greater than zero'; end if;
  if p_scope not in ('company', 'property') then raise exception 'Invalid expense scope'; end if;
  if (p_scope = 'company' and p_property_id is not null)
     or (p_scope = 'property' and nullif(btrim(p_property_id), '') is null) then
    raise exception 'Expense property does not match its scope';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Expected revision must be zero or greater';
  end if;

  if p_expected_revision = 0 then
    insert into public.expenses (
      id, user_id, amount, expense_date, category, scope, property_id,
      description, notes, receipt_metadata, receipt_object_path,
      created_at, updated_at, deleted_at, revision
    ) values (
      p_id, auth.uid(), p_amount, p_expense_date, p_category, p_scope,
      nullif(p_property_id, ''), coalesce(p_description, ''), coalesce(p_notes, ''),
      p_receipt_metadata, nullif(p_receipt_object_path, ''),
      v_now, v_now, p_deleted_at, 1
    )
    on conflict (id) do nothing
    returning expenses.revision, expenses.created_at, expenses.updated_at
    into new_revision, server_created_at, server_updated_at;
  else
    update public.expenses
    set amount = p_amount,
        expense_date = p_expense_date,
        category = p_category,
        scope = p_scope,
        property_id = nullif(p_property_id, ''),
        description = coalesce(p_description, ''),
        notes = coalesce(p_notes, ''),
        receipt_metadata = p_receipt_metadata,
        receipt_object_path = nullif(p_receipt_object_path, ''),
        deleted_at = p_deleted_at,
        updated_at = v_now,
        revision = revision + 1
    where id = p_id and revision = p_expected_revision
    returning expenses.revision, expenses.created_at, expenses.updated_at
    into new_revision, server_created_at, server_updated_at;
  end if;

  if new_revision is null then
    raise exception using errcode = '40001',
      message = 'EXPENSE_CONFLICT: this expense changed on another device';
  end if;
  return next;
end;
$$;

revoke all on function public.upsert_expense_if_current(
  text, numeric, date, text, text, text, text, text, jsonb, text, timestamptz, bigint
) from public, anon;
grant execute on function public.upsert_expense_if_current(
  text, numeric, date, text, text, text, text, text, jsonb, text, timestamptz, bigint
) to authenticated;

commit;

-- Verification:
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'expenses'
-- order by ordinal_position;
