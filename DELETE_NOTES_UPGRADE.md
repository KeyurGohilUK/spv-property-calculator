# Delete Notes Upgrade

This version adds deletion of chat notes.

## Behaviour

- A trash icon is shown only on notes created by the currently signed-in user.
- Deleting a note requires confirmation and an internet connection.
- Deleted notes are removed from Supabase and the local notes cache.
- Users cannot delete notes created by another account.
- Supabase Row Level Security independently enforces ownership, so hiding the button is not the security boundary.

## Supabase update required

Open **Supabase → SQL Editor → New query** and run the complete updated `supabase-schema.sql` from this package.

The important change grants `DELETE` on `property_notes` to authenticated users while an RLS policy limits deletion to:

```sql
(select auth.uid()) = author_user_id
```

No existing property or note data is removed by running the schema migration.

## GitHub Pages deployment

For an existing deployment, replace:

- `app.js`
- `cloud.js`
- `styles.css`
- `service-worker.js`
- `supabase-schema.sql`

Keep your existing `supabase-config.js`.

The PWA cache version is `v1.7.2-delete-notes`.
