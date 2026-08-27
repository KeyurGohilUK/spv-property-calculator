# Push notifications

This folder is the operational reference for Web Push alerts created for shared property notes and scheduled property viewings. The feature is optional and does not affect saved data if push delivery is unavailable.

## Current status

- Browser public VAPID key: configured in `supabase-config.js` and safe to publish.
- Database: `push_subscriptions` is defined by the bootstrap and Update 14.
- Sender: Supabase Edge Function `note-push`.
- Trigger: an `INSERT` webhook on `public.property_notes`.
- Viewing sender: Supabase Edge Function `viewing-reminders`, invoked by Supabase Cron every five minutes.
- Viewing schedule: around 09:00 Europe/London and once when the viewing is within one hour.
- Duplicate prevention: `viewing_reminder_deliveries`, cleaned weekly after a 30-day retention period.
- Recipient rule: subscribed workspace members except the note author.
- Privacy rule: notification content contains the author and property title, never the note text.

## Runbook

- [Setup](SETUP.md) — provision and verify the feature.
- [Architecture](ARCHITECTURE.md) — components, data flow and security boundaries.
- [Testing](TESTING.md) — automated checks and release acceptance test.
- [Troubleshooting](TROUBLESHOOTING.md) — diagnose delivery and configuration failures.

Never commit the VAPID private key, webhook secret, Supabase Secret key or `service_role` key. Keep those values only in Supabase Edge Function secrets or an approved password manager.
