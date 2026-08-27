-- Update 16 - duplicate-safe property viewing push reminders and weekly cleanup.
-- Run once after Update 15. Safe to re-run.

begin;

create table if not exists public.viewing_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references public.properties(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  viewing_at_local timestamp without time zone not null,
  reminder_type text not null check (reminder_type in ('morning','one_hour')),
  status text not null default 'processing' check (status in ('processing','delivered','skipped')),
  created_at timestamptz not null default now(),
  delivered_at timestamptz null,
  unique (property_id, user_id, viewing_at_local, reminder_type)
);
create index if not exists viewing_reminder_cleanup_idx
  on public.viewing_reminder_deliveries (viewing_at_local);

alter table public.viewing_reminder_deliveries enable row level security;
revoke all on table public.viewing_reminder_deliveries from anon, authenticated;

commit;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'cleanup-viewing-reminder-deliveries',
  '0 3 * * 0',
  $$delete from public.viewing_reminder_deliveries
    where viewing_at_local < timezone('Europe/London', now()) - interval '30 days'$$
);

select schemaname, tablename, rowsecurity
from pg_catalog.pg_tables
where schemaname = 'public' and tablename = 'viewing_reminder_deliveries';

select jobname, schedule, active
from cron.job
where jobname = 'cleanup-viewing-reminder-deliveries';
