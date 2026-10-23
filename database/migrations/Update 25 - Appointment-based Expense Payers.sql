-- SPV Property Calculator — Update 25: Appointment-based expense payers
-- Run after Update 24. Existing company and legacy director values remain valid.
begin;

alter table public.expenses
  drop constraint if exists expenses_paid_by_check;

alter table public.expenses
  add constraint expenses_paid_by_check
  check (paid_by in ('company', 'director-a', 'director-b', 'unrecorded')
    or paid_by ~ '^appointment:[A-Za-z0-9_-]{1,160}$');

create or replace function public.upsert_expense_if_current(
  p_id text,
  p_amount numeric,
  p_expense_date date,
  p_category text,
  p_scope text,
  p_property_id text,
  p_description text,
  p_notes text,
  p_paid_by text,
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
  if p_paid_by is null or p_paid_by !~ '^(company|director-a|director-b|unrecorded|appointment:[A-Za-z0-9_-]{1,160})$' then
    raise exception 'Invalid expense payer';
  end if;
  if (p_scope = 'company' and p_property_id is not null)
     or (p_scope = 'property' and nullif(btrim(p_property_id), '') is null) then
    raise exception 'Expense property does not match its scope';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Expected revision must be zero or greater';
  end if;

  if p_expected_revision = 0 then
    insert into public.expenses (
      id, user_id, amount, expense_date, category, paid_by, scope, property_id,
      description, notes, receipt_metadata, receipt_object_path,
      created_at, updated_at, deleted_at, revision
    ) values (
      p_id, auth.uid(), p_amount, p_expense_date, p_category, p_paid_by, p_scope,
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
        paid_by = p_paid_by,
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
  text, numeric, date, text, text, text, text, text, text, jsonb, text, timestamptz, bigint
) from public, anon;
grant execute on function public.upsert_expense_if_current(
  text, numeric, date, text, text, text, text, text, text, jsonb, text, timestamptz, bigint
) to authenticated;

commit;

-- Verification:
-- select conname, pg_get_constraintdef(oid) from pg_catalog.pg_constraint
-- where conrelid = 'public.expenses'::regclass and conname = 'expenses_paid_by_check';
-- select proname, proargnames from pg_proc where proname = 'upsert_expense_if_current';
