-- Update 14 - per-device Web Push subscriptions for shared property notes.
-- Run once after Update 13. This migration is immutable once deployed.

begin;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.workspace_members(user_id) on delete cascade,
  endpoint text not null unique
    check (length(endpoint) between 20 and 2048 and endpoint ~ '^https://'),
  p256dh text not null check (length(p256dh) between 20 and 255),
  auth text not null check (length(auth) between 8 and 255),
  user_agent text not null default '' check (length(user_agent) <= 500),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon;
revoke all on table public.push_subscriptions from authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;

drop policy if exists "Members manage own push subscriptions"
  on public.push_subscriptions;
create policy "Members manage own push subscriptions"
on public.push_subscriptions
for all
to authenticated
using (
  auth.uid() = user_id
  and public.is_workspace_member()
)
with check (
  auth.uid() = user_id
  and public.is_workspace_member()
);

commit;

-- Verification (pg_catalog exposes the RLS flag as `rowsecurity`):
select schemaname, tablename, rowsecurity
from pg_catalog.pg_tables
where schemaname = 'public'
  and tablename = 'push_subscriptions';

select policyname, cmd
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename = 'push_subscriptions';
