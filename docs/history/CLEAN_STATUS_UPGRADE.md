# Clean status UI update

This update removes the visible Supabase connection-status panel from the home page. Cloud/account state remains available from the Account pop-up, and the Home-page **Sync now** button still appears for signed-in users.

## Deploy
Replace these files in the existing GitHub Pages repository:

- `index.html`
- `app.js`
- `styles.css`
- `service-worker.js`

No Supabase SQL or configuration change is required.
