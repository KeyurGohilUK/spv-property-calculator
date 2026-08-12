# Shared Notes Upgrade

This version adds a shared Notes section to the Property Purchase Details editor.

## 1. Update Supabase

1. Open **Supabase → SQL Editor → New query**.
2. Copy and run the entire updated `supabase-schema.sql` file.
3. This creates `property_notes` with RLS so only authenticated users can read/add notes.
4. Existing property records are preserved.

## 2. Display names

The Account pop-up now has a **Display name** field. Save each user's name once. New notes store that name plus the note timestamp. If no display name exists, the app falls back to the signed-in email address.

## 3. Deploy

Keep your existing working `supabase-config.js`, then replace the updated web files in GitHub and commit to the Pages branch. The PWA cache version is `v1.7.0-shared-notes`.

## Notes behaviour

- Notes appear only for saved properties.
- Notes are shared across all authenticated users.
- Notes are append-only in the browser app: no edit/delete action is exposed.
- Permanently deleting a property also removes its notes via the database foreign-key cascade.
- The last successfully loaded note history is cached locally for offline viewing. Adding a new shared note requires an internet connection.
