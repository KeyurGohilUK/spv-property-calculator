-- ============================================================================
-- SPV Property Calculator
-- Update 11: Private Cloudflare R2 receipt references
-- Run after Update 10. Safe to re-run.
-- Receipt binaries remain private in R2; Supabase stores only object keys.
-- ============================================================================

begin;

alter table public.expenses
  add column if not exists receipt_object_path text null;

create unique index if not exists expenses_receipt_object_path_idx
  on public.expenses (receipt_object_path)
  where receipt_object_path is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'expenses_receipt_object_path_check'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_receipt_object_path_check
      check (
        receipt_object_path is null
        or receipt_object_path ~ '^receipts/[A-Za-z0-9_-]{1,160}/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$'
      );
  end if;
end $$;

comment on column public.expenses.receipt_object_path is
  'Private Cloudflare R2 object key. Never store public or presigned receipt URLs here.';

revoke all on function public.is_workspace_member(), public.is_workspace_editor() from public, anon;
grant execute on function public.is_workspace_member(), public.is_workspace_editor() to authenticated;

commit;

-- Verification:
-- select column_name, data_type from information_schema.columns
-- where table_schema = 'public' and table_name = 'expenses'
-- and column_name in ('receipt_metadata', 'receipt_object_path');
-- select indexname from pg_indexes
-- where schemaname = 'public' and indexname = 'expenses_receipt_object_path_idx';
