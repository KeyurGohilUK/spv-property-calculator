# Upgrade an existing Supabase project to shared properties

Use this when you already deployed the previous per-user cloud-sync edition.

## What changes

Previously, Supabase RLS allowed each account to see only rows where `user_id = auth.uid()`.

This edition keeps login mandatory but makes `public.properties` a **shared workspace**:

- every authenticated user can read all properties;
- every authenticated user can create properties;
- every authenticated user can edit any property;
- every authenticated user can delete any property;
- signed-out users still have no table access.

Existing cloud properties are preserved. The migration changes the primary key from `(user_id, id)` to `id`, because one shared property must have one shared row regardless of which user edits it.

## One-time upgrade steps

1. In your existing Supabase project, open **SQL Editor → New query**.
2. Open the new `supabase-schema.sql` included with this build.
3. Copy the complete SQL into Supabase and click **Run**.
4. In **Table Editor → properties**, confirm your existing rows are still present.
5. Deploy all files from this build to GitHub Pages, replacing the older version.
6. Open the website once in Safari/Chrome while online. The service-worker cache version has been changed so the new files can replace the old PWA cache.
7. Sign in as User 1 and press **Sync now**.
8. Sign in as User 2 on another browser/device and press **Sync now**. Both should see the same list. While the app remains open, it also refreshes the shared cloud data periodically and when you return to the app.

## Limit access to your 2–3 users

Create the accounts you want to use, then disable public sign-ups in Supabase Authentication settings. Existing users can continue to sign in, while random visitors cannot create another account.

The browser app must contain only your Supabase Project URL and Publishable/anon key. Never add a Secret or `service_role` key.

## Collaboration behaviour

The app remains offline-first. A user can edit while offline and sync later. If two copies of the same property differ, the copy with the newer `updatedAt` timestamp wins.

For offline deletes, this version adds an extra safeguard: if another user made a newer cloud edit after the offline deletion occurred, that newer edit wins instead of the older offline deletion wiping it.


## Editing at the same time

This is intentionally a simple small-team sync model rather than Google-Docs-style live co-editing. If two users save different versions of the same property, the most recently saved `updatedAt` version wins on sync.
