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

## 5. Enable each device

1. Deploy the web app and open the latest release.
2. Sign in as a workspace member.
3. Install the PWA. On iPhone/iPad, use **Share → Add to Home Screen**, then open that installed app.
4. Open **More → Note Notifications** and enable notifications.
5. Accept the browser permission prompt.

Subscriptions are per browser profile and per device. Repeat these steps on every device that should receive alerts, then complete the [acceptance test](TESTING.md).
