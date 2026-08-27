# Testing

## Automated checks

Run from the repository root:

```bash
npm test
npm run test:html
```

The suite validates the VAPID public-key shape, subscription lifecycle, service-worker handlers, same-origin navigation, webhook authentication, viewing schedule boundaries, duplicate protection, cleanup retention, payload privacy, stale-subscription cleanup, RLS migrations and documentation structure.

## Release acceptance test

Use two workspace accounts on two browser profiles or devices.

1. Sign in as member A and enable **More → Notifications**.
2. Sign in as member B on the second device and enable notifications.
3. Confirm both users have a row in `public.push_subscriptions`.
4. As member A, add a note to a property.
5. Confirm member B receives one notification and member A receives none.
6. Confirm the notification identifies the author/property but does not contain the note text.
7. Tap member B's notification and confirm the correct property opens on the app's own origin.
8. Disable notifications on member B's device and confirm its subscription row is removed.
9. Add another note as member A and confirm member B no longer receives an alert.

Also test with the receiving app closed and with the sender briefly offline. An offline note should notify only after its database insert eventually synchronises.

## Viewing reminder acceptance test

1. Enable notifications on a device owned by the user who created the property.
2. Temporarily create viewings that exercise the 09:00 and one-hour windows, or invoke the pure schedule tests with fixed dates.
3. Confirm a viewing after 10:00 receives the morning reminder and later the one-hour reminder.
4. Confirm a viewing at or before 10:00 receives only the one-hour reminder.
5. Invoke the Edge Function twice in the same window and confirm only one notification is delivered.
6. Tap the alert and confirm it opens the correct property.
7. Confirm another workspace member does not receive the owner's reminder.
8. Confirm function logs contain no property data beyond the safe title and identifiers needed for delivery.

## Release evidence

Before merging a push change, retain:

- passing repository CI,
- a successful Edge Function invocation in Supabase logs,
- a successful two-account acceptance test,
- confirmation that no private key or webhook secret appears in the diff or logs.
