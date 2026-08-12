# UI Refresh Upgrade (v1.5)

This update changes only the interface. No Supabase SQL/database migration is required.

## Changes

- App icon/title in the sticky header now works as a Home link.
- **Sync now** is positioned directly beside **New Property** when the user is signed in.
- **Archived Properties** is presented as a quieter secondary action below the main actions.
- Home action area has improved spacing, hierarchy and responsive iPhone layout.
- Service-worker cache version is now `v1.5.0-ui-refresh`.

## Safest deployment to your existing GitHub repository

Replace only these four files:

- `index.html`
- `styles.css`
- `app.js`
- `service-worker.js`

This leaves your existing `supabase-config.js` untouched, so your working Supabase URL/key remain in place.

Commit the changes to the branch used by GitHub Pages (normally `main`). No Supabase SQL needs to be run for this UI-only update.

If an installed PWA still shows the old interface, open the GitHub Pages URL in Safari/Chrome while online and refresh it once, then close and reopen the Home Screen app.
