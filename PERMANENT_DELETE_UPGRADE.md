# Permanent Delete Upgrade

This version keeps **Archive** as the normal action on the main property list and adds **Permanently Delete** only inside **Archived Properties**.

## 1. Update Supabase first

1. Open your Supabase project.
2. Go to **SQL Editor → New query**.
3. Copy the complete contents of `supabase-schema.sql` from this package.
4. Run the SQL.

The migration preserves existing active and archived properties. It adds a small `property_deletions` table containing only deleted property IDs and deletion timestamps. This prevents another user's offline cache from recreating a permanently deleted property.

## 2. Keep your existing Supabase configuration

Copy your working `supabase-config.js` from the currently deployed project into this new project folder, or enter the same Project URL and Publishable key. Never put a secret/service-role key in the browser app.

## 3. Redeploy to GitHub Pages

Replace the old repository files with this package and commit to the branch used by GitHub Pages. The service-worker cache version is now `v1.4.0-permanent-delete`, so the new build can replace the previous installed PWA cache.

## Behaviour

- Main property page: **Archive** only.
- Archived Properties page: **Restore Property** or **Permanently Delete**.
- Permanent deletion requires the user to be signed in and online.
- A confirmation warns that deletion cannot be undone and affects all users.
- Property data is deleted from `properties`; only a small deletion tombstone remains so offline devices cannot resurrect it.
