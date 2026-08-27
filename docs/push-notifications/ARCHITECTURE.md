# Architecture and security

## Delivery flow

1. A signed-in member inserts a row in `public.property_notes`.
2. Supabase Database Webhooks sends the insert record to `note-push` with `x-note-push-secret`.
3. The Edge Function validates the secret, confirms the payload and loads subscriptions for other workspace members.
4. The function sends a standards-based Web Push message signed with the private VAPID key.
5. `service-worker.js` displays the notification and limits click destinations to the app origin.
6. A tap focuses or opens the app at the relevant property.

Note persistence is independent of delivery. Webhook or push-provider failure does not roll back the saved note.

For viewing reminders, Supabase Cron invokes `viewing-reminders` every five minutes. The function reads active properties, calculates due reminders in `Europe/London`, atomically claims each reminder through the delivery table, and sends it only to the property owner's enabled devices. Viewings at or before 10:00 receive only the one-hour reminder. A weekly database job removes delivery rows 30 days after their viewing time; deleting a property removes its rows immediately.

## Component ownership

| Component | Responsibility |
|---|---|
| `src/services/push-subscription.js` | Browser capability checks and subscription lifecycle |
| `src/components/notification-settings.js` | Per-device user controls |
| `cloud.js` | Authenticated subscription persistence |
| `service-worker.js` | Display and safe notification navigation |
| `supabase/functions/note-push/index.ts` | Authentication, recipient selection, payload creation and delivery |
| `supabase/functions/viewing-reminders/` | UK-time scheduling, duplicate claims and viewing delivery |
| `push_subscriptions` | One or more device endpoints per workspace user |
| `viewing_reminder_deliveries` | Minimal duplicate-prevention and delivery history |
| Database webhook | Starts delivery after a note insert |
| Supabase Cron | Checks viewing reminders every five minutes and cleans old claims weekly |

## Security and privacy boundaries

- Row Level Security lets authenticated workspace members manage only their own subscriptions.
- Anonymous table access is revoked. The Edge Function uses its server-side service role only for delivery.
- The webhook uses a constant-time comparison of the shared secret.
- The note author is excluded from recipients.
- Viewing reminders go only to the property owner's active subscriptions.
- The cron endpoint requires a separate constant-time-checked secret.
- Push payloads do not include private note text.
- Notification URLs are restricted to the installed app's origin and scope.
- HTTP 404 and 410 responses remove expired subscriptions.
- The public VAPID key and Supabase publishable key are intentionally public. The VAPID private key, webhook secret and service-role credentials are secret.

## Operational constraints

Web Push requires HTTPS, browser permission and a valid subscription. iOS/iPadOS requires a Home Screen web app. Browser or operating-system delivery is best effort, so push must never be the only record of a note or a critical workflow guarantee.
