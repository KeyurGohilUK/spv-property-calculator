# Architecture and security

## Delivery flow

1. A signed-in member inserts a row in `public.property_notes`.
2. Supabase Database Webhooks sends the insert record to `note-push` with `x-note-push-secret`.
3. The Edge Function validates the secret, confirms the payload and loads subscriptions for other workspace members.
4. The function sends a standards-based Web Push message signed with the private VAPID key.
5. `service-worker.js` displays the notification and limits click destinations to the app origin.
6. A tap focuses or opens the app at the relevant property.

Note persistence is independent of delivery. Webhook or push-provider failure does not roll back the saved note.

## Component ownership

| Component | Responsibility |
|---|---|
| `src/services/push-subscription.js` | Browser capability checks and subscription lifecycle |
| `src/components/notification-settings.js` | Per-device user controls |
| `cloud.js` | Authenticated subscription persistence |
| `service-worker.js` | Display and safe notification navigation |
| `supabase/functions/note-push/index.ts` | Authentication, recipient selection, payload creation and delivery |
| `push_subscriptions` | One or more device endpoints per workspace user |
| Database webhook | Starts delivery after a note insert |

## Security and privacy boundaries

- Row Level Security lets authenticated workspace members manage only their own subscriptions.
- Anonymous table access is revoked. The Edge Function uses its server-side service role only for delivery.
- The webhook uses a constant-time comparison of the shared secret.
- The note author is excluded from recipients.
- Push payloads do not include private note text.
- Notification URLs are restricted to the installed app's origin and scope.
- HTTP 404 and 410 responses remove expired subscriptions.
- The public VAPID key and Supabase publishable key are intentionally public. The VAPID private key, webhook secret and service-role credentials are secret.

## Operational constraints

Web Push requires HTTPS, browser permission and a valid subscription. iOS/iPadOS requires a Home Screen web app. Browser or operating-system delivery is best effort, so push must never be the only record of a note or a critical workflow guarantee.
