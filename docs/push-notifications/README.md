# Note push notifications

This folder is the operational reference for Web Push alerts created when a workspace member adds a property note. The feature is optional and does not affect note saving or synchronisation if push delivery is unavailable.

## Current status

- Browser public VAPID key: configured in `supabase-config.js` and safe to publish.
- Database: `push_subscriptions` is defined by the bootstrap and Update 14.
- Sender: Supabase Edge Function `note-push`.
- Trigger: an `INSERT` webhook on `public.property_notes`.
- Recipient rule: subscribed workspace members except the note author.
- Privacy rule: notification content contains the author and property title, never the note text.

## Runbook

- [Setup](SETUP.md) — provision and verify the feature.
- [Architecture](ARCHITECTURE.md) — components, data flow and security boundaries.
- [Testing](TESTING.md) — automated checks and release acceptance test.
- [Troubleshooting](TROUBLESHOOTING.md) — diagnose delivery and configuration failures.

Never commit the VAPID private key, webhook secret, Supabase Secret key or `service_role` key. Keep those values only in Supabase Edge Function secrets or an approved password manager.
