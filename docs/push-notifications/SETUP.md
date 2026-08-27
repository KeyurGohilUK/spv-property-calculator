# Setup

## Prerequisites

- Supabase CLI installed and authenticated.
- Repository linked to Supabase project `abegxabdlecgznapukzq`.
- One VAPID key pair. Generate it from any trusted terminal; being inside the repository is convenient but not required:

  ```bash
  npx web-push generate-vapid-keys --json
  ```

The public key belongs in `supabase-config.js`. The private key must never be committed. If the key pair is replaced, update the browser public key and Edge Function secrets together; existing browser subscriptions must then be enabled again.

## 1. Database

For an existing project, run `database/migrations/Update 14 - Note Push Notifications.sql` once in Supabase SQL Editor. Fresh projects use `database/bootstrap/00 - Bootstrap Complete Schema.sql` instead.

If Update 14 previously ended with `column "row_security" does not exist`, the migration transaction had already committed; run only these corrected read-only checks:

```sql
select schemaname, tablename, rowsecurity
from pg_catalog.pg_tables
where schemaname = 'public'
  and tablename = 'push_subscriptions';

select policyname, cmd
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename = 'push_subscriptions';
```

Expected results are `rowsecurity = true` and an `ALL` policy named `Members manage own push subscriptions`.

## 2. Edge Function secrets

Set the same public key as the browser configuration, its matching private key, a contact URI, and a new high-entropy webhook secret:

```bash
supabase secrets set \
  VAPID_SUBJECT=mailto:YOUR_EMAIL \
  VAPID_PUBLIC_KEY=YOUR_PUBLIC_KEY \
  VAPID_PRIVATE_KEY=YOUR_PRIVATE_KEY \
  NOTE_PUSH_WEBHOOK_SECRET=YOUR_LONG_RANDOM_SECRET
```

Do not prefix the values with `VITE_`, expose them in browser code, paste them into issues, or store them in this documentation.

## 3. Deploy the sender

From the repository root, run:

```bash
supabase functions deploy note-push
```

The deployed URL is:

```text
https://abegxabdlecgznapukzq.supabase.co/functions/v1/note-push
```

## 4. Create the database webhook

In Supabase open **Integrations → Webhooks**. The direct project route is:

```text
https://supabase.com/dashboard/project/abegxabdlecgznapukzq/integrations/webhooks/overview
```

Create this webhook:

| Setting | Value |
|---|---|
| Name | `property-note-push` |
| Schema/table | `public.property_notes` |
| Event | `INSERT` only |
| Method | `POST` |
| URL | Edge Function URL above |
| HTTP header | `x-note-push-secret: YOUR_LONG_RANDOM_SECRET` |
| Timeout | `5000` ms |

The header value must exactly match `NOTE_PUSH_WEBHOOK_SECRET`.

## 5. Configure viewing reminders

Run `database/migrations/Update 16 - Viewing Push Reminders.sql` in the SQL Editor. This creates the duplicate-prevention table and the weekly 30-day cleanup job.

Create one new high-entropy secret and store the same value in the Edge Function and Supabase Vault:

```bash
supabase secrets set VIEWING_REMINDER_CRON_SECRET=YOUR_NEW_RANDOM_SECRET
supabase functions deploy viewing-reminders
```

Then run the following in the SQL Editor, replacing only `YOUR_NEW_RANDOM_SECRET`:

```sql
create extension if not exists pg_net with schema extensions;

select vault.create_secret(
  'YOUR_NEW_RANDOM_SECRET',
  'viewing_reminder_cron_secret',
  'Authenticates the five-minute viewing reminder job'
);

select cron.schedule(
  'send-viewing-reminders',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := 'https://abegxabdlecgznapukzq.supabase.co/functions/v1/viewing-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-viewing-reminder-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'viewing_reminder_cron_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $job$
);
```

Verify both jobs:

```sql
select jobname, schedule, active
from cron.job
where jobname in ('send-viewing-reminders', 'cleanup-viewing-reminder-deliveries');
```

Expected schedules are every five minutes for sending and Sunday at 03:00 for cleanup. Never paste the secret into repository files, screenshots or support logs.

## 6. Enable each device

1. Deploy the web app and open the latest release.
2. Sign in as a workspace member.
3. Install the PWA. On iPhone/iPad, use **Share → Add to Home Screen**, then open that installed app.
4. Open **More → Notifications** and enable notifications.
5. Accept the browser permission prompt.

Subscriptions are per browser profile and per device. Repeat these steps on every device that should receive alerts, then complete the [acceptance test](TESTING.md).
