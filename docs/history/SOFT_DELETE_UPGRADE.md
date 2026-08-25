# Upgrade to Soft Delete / Archived Properties

This version changes **Delete** into **Archive**.

- Active properties stay on the main page.
- Archived properties move to a separate **Archived Properties** page.
- Archived rows remain in local storage and Supabase.
- Any authenticated user in the shared workspace can archive or restore a property.
- Authenticated app users no longer receive SQL `DELETE` permission on `properties`.

## Upgrade steps

1. Optional but recommended: back up/export `public.properties` in Supabase Table Editor.
2. Open **Supabase → SQL Editor → New query**.
3. Copy the complete contents of `supabase-schema.sql`, paste it and click **Run**.
4. Keep your existing working Supabase Project URL and Publishable key in `supabase-config.js`.
5. Replace the files in your existing GitHub repository with this package and commit to the Pages branch (normally `main`).
6. Open the GitHub Pages site once while online. The service-worker cache was bumped to `v1.3.0-soft-delete`.

Do not delete your existing Supabase `properties` table. The SQL migration preserves existing rows and adds the nullable `deleted_at` field.

## Test with two users

1. User A creates a test property.
2. User B syncs and confirms it appears.
3. User A taps **Archive**.
4. User B syncs: it should disappear from the main list and appear under **Archived**.
5. User B taps **Restore Property**.
6. User A syncs: it should return to the main list.

The shared workspace still uses `updatedAt` for last-write-wins conflict handling. Archive and restore both count as normal updates.

If a device still contains a pending hard-delete tombstone from the previous version, this release converts it to an archive on the next successful sync instead of permanently deleting the cloud row.
