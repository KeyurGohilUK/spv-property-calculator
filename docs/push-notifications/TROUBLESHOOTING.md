# Troubleshooting and operations

## Webhooks is missing from Database

Use **Integrations → Webhooks**, not the older **Database → Webhooks** route. For this project open:

```text
https://supabase.com/dashboard/project/abegxabdlecgznapukzq/integrations/webhooks/overview
```

## Notification control is unavailable

- Confirm the deployed `supabase-config.js` contains `pushPublicKey`.
- Refresh or fully close and reopen the installed PWA so release `1.21.40` replaces the old service-worker cache.
- Confirm the user is signed in and is a workspace member.
- On iOS/iPadOS, open the app from its Home Screen icon.

## Permission was denied

Browser permission cannot be bypassed in code. Re-enable notifications for the site/app in operating-system or browser settings, then use the in-app control again. If the browser offers no reset, remove and reinstall the PWA.

## Subscription succeeds but no alert arrives

Check in this order:

1. A subscription row exists for the receiving user.
2. The `property-note-push` webhook is enabled for `INSERT` on `public.property_notes`.
3. Its URL and `x-note-push-secret` header are correct.
4. Supabase Edge Function logs show a `note-push` invocation.
5. `VAPID_PUBLIC_KEY` matches the browser key and `VAPID_PRIVATE_KEY` belongs to the same pair.
6. The receiver is a different workspace member from the note author.
7. Device/browser notification settings and Focus modes allow delivery.

Avoid placing note text, private keys or the webhook secret in screenshots or support logs.

## SQL verification reports `row_security` missing

Do not rerun the full migration solely for this error. The old verification statement used a nonexistent `information_schema` column after `commit`. Run the corrected `pg_catalog.pg_tables.rowsecurity` and `pg_catalog.pg_policies` queries in [Setup](SETUP.md).

## Expired or duplicated subscriptions

The endpoint is unique. A fresh enable updates the existing endpoint, while push-provider HTTP 404/410 responses are removed automatically. To reset one device, disable notifications in the app, confirm its row is removed, then enable again.

## Secret rotation or emergency disable

To rotate credentials, update Supabase secrets and the webhook header as one maintenance change. Rotating the VAPID key also requires a web release with the new public key and users must resubscribe.

To stop sends without affecting notes, disable the database webhook. To retire the feature, disable the webhook first, ask users to turn off notifications, and only then consider removing subscriptions or secrets through a reviewed migration/operations change.

## Viewing reminder did not arrive

1. Confirm `send-viewing-reminders` is active in `cron.job` and has run within five minutes.
2. Confirm the property has a valid `viewingDate` and is not archived.
3. Confirm the property owner's device has an active row in `push_subscriptions`.
4. Check `viewing_reminder_deliveries`: `delivered` means a push provider accepted it; `skipped` means no active owner subscription existed.
5. Confirm the Vault value matches `VIEWING_REMINDER_CRON_SECRET` without exposing either value.
6. Remember that delivery is best effort and device Focus modes can suppress an accepted push.
