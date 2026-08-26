-- ============================================================================
-- SPV Property Calculator - complete database bootstrap
-- Current through Update 15 (Policy Acceptance)
--
-- Use for a fresh or replacement Supabase project. Create at least one Auth user
-- first; the oldest account is made the initial administrator. Safe to re-run.
-- ============================================================================

begin;
create extension if not exists pgcrypto;

create table if not exists public.workspace_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('viewer','editor','admin')),
  active boolean not null default true,
  added_at timestamptz not null default now(),
  added_by uuid null references auth.users(id) on delete set null
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.workspace_members(user_id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 20 and 2048 and endpoint ~ '^https://'),
  p256dh text not null check (length(p256dh) between 20 and 255),
  auth text not null check (length(auth) between 8 and 255),
  user_agent text not null default '' check (length(user_agent) <= 500),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

create table if not exists public.policy_acceptances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  disclaimer_version text not null,
  accepted_at timestamptz not null default now()
);

create table if not exists public.properties (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  revision bigint not null default 1 check (revision >= 1)
);
create index if not exists properties_updated_idx on public.properties(updated_at desc);
create index if not exists properties_deleted_idx on public.properties(deleted_at) where deleted_at is not null;

create table if not exists public.property_notes (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references public.properties(id) on delete cascade,
  author_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  author_name text not null default '',
  note text not null check (length(btrim(note)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists property_notes_property_idx on public.property_notes(property_id, created_at desc);

create table if not exists public.property_deletions (
  id text primary key,
  deleted_at timestamptz not null default now(),
  deleted_by uuid null references auth.users(id) on delete set null
);

create table if not exists public.expenses (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  expense_date date not null,
  category text not null,
  scope text not null check (scope in ('company','property')),
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
    (scope='company' and property_id is null) or
    (scope='property' and property_id is not null)
  ),
  constraint expenses_receipt_object_path_check check (
    receipt_object_path is null
    or receipt_object_path ~ '^receipts/[A-Za-z0-9_-]{1,160}/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$'
  )
);
create index if not exists expenses_date_idx on public.expenses(expense_date desc);
create index if not exists expenses_property_idx on public.expenses(property_id) where property_id is not null;
create index if not exists expenses_updated_idx on public.expenses(updated_at desc);
create unique index if not exists expenses_receipt_object_path_idx
  on public.expenses(receipt_object_path) where receipt_object_path is not null;

alter table public.workspace_members enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.policy_acceptances enable row level security;
alter table public.properties enable row level security;
alter table public.property_notes enable row level security;
alter table public.property_deletions enable row level security;
alter table public.expenses enable row level security;

insert into public.workspace_members(user_id, role, active)
select id, 'admin', true from auth.users
where not exists (select 1 from public.workspace_members)
order by created_at asc limit 1
on conflict (user_id) do nothing;

do $$
begin
  if not exists(select 1 from public.workspace_members where role='admin' and active) then
    raise exception 'Create the initial Auth user before running the bootstrap';
  end if;
end $$;

create or replace function public.is_workspace_member() returns boolean
language sql stable security definer set search_path=public,pg_temp
as $$ select exists(select 1 from public.workspace_members where user_id=auth.uid() and active) $$;
create or replace function public.is_workspace_editor() returns boolean
language sql stable security definer set search_path=public,pg_temp
as $$ select exists(select 1 from public.workspace_members where user_id=auth.uid() and active and role in ('editor','admin')) $$;
create or replace function public.is_workspace_admin() returns boolean
language sql stable security definer set search_path=public,pg_temp
as $$ select exists(select 1 from public.workspace_members where user_id=auth.uid() and active and role='admin') $$;

revoke all on table public.workspace_members, public.properties, public.property_notes, public.property_deletions, public.expenses, public.push_subscriptions, public.policy_acceptances from anon;
revoke all on table public.workspace_members, public.properties, public.property_notes, public.property_deletions, public.expenses, public.push_subscriptions, public.policy_acceptances from authenticated;
grant select on table public.workspace_members, public.properties, public.property_notes, public.property_deletions, public.expenses to authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant select, insert, update on table public.policy_acceptances to authenticated;
revoke all on function public.is_workspace_member(), public.is_workspace_editor(), public.is_workspace_admin() from public, anon;
grant execute on function public.is_workspace_member(), public.is_workspace_editor(), public.is_workspace_admin() to authenticated;

drop policy if exists "Members read own membership" on public.workspace_members;
create policy "Members read own membership" on public.workspace_members for select to authenticated using (auth.uid()=user_id);
drop policy if exists "Members manage own push subscriptions" on public.push_subscriptions;
create policy "Members manage own push subscriptions" on public.push_subscriptions for all to authenticated
using (auth.uid()=user_id and public.is_workspace_member())
with check (auth.uid()=user_id and public.is_workspace_member());
drop policy if exists "Users read own policy acceptance" on public.policy_acceptances;
create policy "Users read own policy acceptance" on public.policy_acceptances for select to authenticated using (auth.uid()=user_id);
drop policy if exists "Users create own policy acceptance" on public.policy_acceptances;
create policy "Users create own policy acceptance" on public.policy_acceptances for insert to authenticated with check (auth.uid()=user_id);
drop policy if exists "Users update own policy acceptance" on public.policy_acceptances;
create policy "Users update own policy acceptance" on public.policy_acceptances for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists "Members read properties" on public.properties;
create policy "Members read properties" on public.properties for select to authenticated using (public.is_workspace_member());
drop policy if exists "Members read notes" on public.property_notes;
create policy "Members read notes" on public.property_notes for select to authenticated using (public.is_workspace_member());
drop policy if exists "Editors add notes" on public.property_notes;
create policy "Editors add notes" on public.property_notes for insert to authenticated
with check (public.is_workspace_editor() and auth.uid()=author_user_id);
drop policy if exists "Editors delete own notes" on public.property_notes;
create policy "Editors delete own notes" on public.property_notes for delete to authenticated
using (public.is_workspace_editor() and auth.uid()=author_user_id);
drop policy if exists "Members read deletion tombstones" on public.property_deletions;
create policy "Members read deletion tombstones" on public.property_deletions for select to authenticated using (public.is_workspace_member());
drop policy if exists "Members read expenses" on public.expenses;
create policy "Members read expenses" on public.expenses for select to authenticated using (public.is_workspace_member());

create or replace function public.upsert_property_if_current(
 p_id text,p_data jsonb,p_created_at timestamptz,p_deleted_at timestamptz,p_expected_revision bigint)
returns table(new_revision bigint,server_created_at timestamptz,server_updated_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_now timestamptz:=now();
begin
 if auth.uid() is null or not public.is_workspace_editor() then raise exception 'Approved editor access is required'; end if;
 if p_expected_revision=0 then
  insert into public.properties(id,user_id,data,created_at,updated_at,deleted_at,revision)
  values(p_id,auth.uid(),coalesce(p_data,'{}'::jsonb),coalesce(p_created_at,v_now),v_now,p_deleted_at,1)
  on conflict(id) do nothing
  returning revision,created_at,updated_at into new_revision,server_created_at,server_updated_at;
 else
  update public.properties set data=coalesce(p_data,'{}'::jsonb),updated_at=v_now,deleted_at=p_deleted_at,revision=revision+1
  where id=p_id and revision=p_expected_revision
  returning revision,created_at,updated_at into new_revision,server_created_at,server_updated_at;
 end if;
 if new_revision is null then raise exception using errcode='40001',message='PROPERTY_CONFLICT: this property changed on another device'; end if;
 return next;
end $$;
revoke all on function public.upsert_property_if_current(text,jsonb,timestamptz,timestamptz,bigint) from public,anon;
grant execute on function public.upsert_property_if_current(text,jsonb,timestamptz,timestamptz,bigint) to authenticated;

create or replace function public.permanently_delete_property(p_id text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.is_workspace_admin() then raise exception 'Administrator access is required'; end if;
 perform 1 from public.properties where id=p_id and deleted_at is not null for update;
 if not found then raise exception 'Only archived properties can be permanently deleted'; end if;
 insert into public.property_deletions(id,deleted_at,deleted_by) values(p_id,now(),auth.uid())
 on conflict(id) do update set deleted_at=excluded.deleted_at,deleted_by=excluded.deleted_by;
 delete from public.properties where id=p_id;
end $$;
revoke all on function public.permanently_delete_property(text) from public,anon;
grant execute on function public.permanently_delete_property(text) to authenticated;

create or replace function public.upsert_expense_if_current(
 p_id text,p_amount numeric,p_expense_date date,p_category text,p_scope text,p_property_id text,
 p_description text,p_notes text,p_receipt_metadata jsonb,p_receipt_object_path text,
 p_deleted_at timestamptz,p_expected_revision bigint)
returns table(new_revision bigint,server_created_at timestamptz,server_updated_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_now timestamptz:=now();
begin
 if auth.uid() is null or not public.is_workspace_editor() then raise exception 'Approved editor access is required'; end if;
 if p_amount<=0 or p_scope not in ('company','property') then raise exception 'Invalid expense'; end if;
 if (p_scope='company' and nullif(p_property_id,'') is not null) or (p_scope='property' and nullif(p_property_id,'') is null) then raise exception 'Expense property does not match scope'; end if;
 if p_expected_revision=0 then
  insert into public.expenses(id,user_id,amount,expense_date,category,scope,property_id,description,notes,receipt_metadata,receipt_object_path,created_at,updated_at,deleted_at,revision)
  values(p_id,auth.uid(),p_amount,p_expense_date,p_category,p_scope,nullif(p_property_id,''),coalesce(p_description,''),coalesce(p_notes,''),p_receipt_metadata,nullif(p_receipt_object_path,''),v_now,v_now,p_deleted_at,1)
  on conflict(id) do nothing
  returning revision,created_at,updated_at into new_revision,server_created_at,server_updated_at;
 else
  update public.expenses set amount=p_amount,expense_date=p_expense_date,category=p_category,scope=p_scope,property_id=nullif(p_property_id,''),description=coalesce(p_description,''),notes=coalesce(p_notes,''),receipt_metadata=p_receipt_metadata,receipt_object_path=nullif(p_receipt_object_path,''),deleted_at=p_deleted_at,updated_at=v_now,revision=revision+1
  where id=p_id and revision=p_expected_revision
  returning revision,created_at,updated_at into new_revision,server_created_at,server_updated_at;
 end if;
 if new_revision is null then raise exception using errcode='40001',message='EXPENSE_CONFLICT: this expense changed on another device'; end if;
 return next;
end $$;
revoke all on function public.upsert_expense_if_current(text,numeric,date,text,text,text,text,text,jsonb,text,timestamptz,bigint) from public,anon;
grant execute on function public.upsert_expense_if_current(text,numeric,date,text,text,text,text,text,jsonb,text,timestamptz,bigint) to authenticated;

drop function if exists public.list_workspace_users();
create function public.list_workspace_users()
returns table(user_id uuid,email text,display_name text,role text,active boolean,created_at timestamptz,last_sign_in_at timestamptz,policy_accepted_at timestamptz,terms_version text,privacy_version text,disclaimer_version text)
language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
 if auth.uid() is null or not public.is_workspace_admin() then raise exception 'Administrator access is required'; end if;
 return query
 select account.id,account.email::text,
  coalesce(nullif(account.raw_user_meta_data->>'display_name',''),nullif(account.raw_user_meta_data->>'full_name',''),split_part(coalesce(account.email,''),'@',1))::text,
  member.role::text,coalesce(member.active,false),account.created_at,account.last_sign_in_at,
  acceptance.accepted_at,acceptance.terms_version,acceptance.privacy_version,acceptance.disclaimer_version
 from auth.users account
 left join public.workspace_members member on member.user_id=account.id
 left join public.policy_acceptances acceptance on acceptance.user_id=account.id
 order by coalesce(member.active,false) desc,lower(coalesce(account.email,''));
end $$;

create or replace function public.set_workspace_user_access(p_user_id uuid,p_role text,p_active boolean) returns void
language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
 if auth.uid() is null or not public.is_workspace_admin() then raise exception 'Administrator access is required'; end if;
 if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then raise exception 'User account was not found'; end if;
 if p_role not in ('viewer','editor','admin') then raise exception 'Role must be viewer, editor or admin'; end if;
 if p_user_id=auth.uid() then raise exception 'Administrators cannot change their own access'; end if;
 insert into public.workspace_members(user_id,role,active) values(p_user_id,p_role,p_active)
 on conflict(user_id) do update set role=excluded.role,active=excluded.active;
end $$;
revoke all on function public.list_workspace_users() from public,anon;
revoke all on function public.set_workspace_user_access(uuid,text,boolean) from public,anon;
grant execute on function public.list_workspace_users() to authenticated;
grant execute on function public.set_workspace_user_access(uuid,text,boolean) to authenticated;

commit;
