-- ============================================================================
-- SPV Property Calculator
-- Update 20: Task due-date push reminder deduplication
--
-- Run after Update 19 on an existing Supabase project.
-- Safe to re-run.
--
-- After running, deploy the task-reminders Edge Function and schedule it in
-- the Supabase dashboard (Cron Jobs) to run daily at 08:00 Europe/London:
--   POST https://<project>.supabase.co/functions/v1/task-reminders
--   Header: x-task-reminder-secret: <TASK_REMINDER_CRON_SECRET>
-- ============================================================================

begin;

create table if not exists public.task_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  task_id text not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('due_today', 'overdue')),
  sent_on date not null default current_date,
  status text not null default 'processing' check (status in ('processing', 'delivered', 'skipped')),
  created_at timestamptz not null default now(),
  unique (task_id, user_id, sent_on)
);

create index if not exists task_reminder_cleanup_idx
  on public.task_reminder_deliveries (sent_on);

-- The Edge Function uses the service role key, so no authenticated access needed.
alter table public.task_reminder_deliveries enable row level security;
revoke all on table public.task_reminder_deliveries from anon, authenticated;

commit;

-- Weekly cleanup of old delivery records (Sunday 04:00 UTC).
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'cleanup-task-reminder-deliveries',
  '0 4 * * 0',
  $$delete from public.task_reminder_deliveries
    where sent_on < current_date - interval '30 days'$$
);

-- Verification:
-- select schemaname, tablename, rowsecurity
-- from pg_catalog.pg_tables
-- where schemaname = 'public' and tablename = 'task_reminder_deliveries';
--
-- select jobname, schedule, active
-- from cron.job
-- where jobname = 'cleanup-task-reminder-deliveries';
