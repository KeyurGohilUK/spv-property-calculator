# SPV Property Calculator — Shared Archive Edition

A mobile-first Progressive Web App for estimating the cash required to buy a residential investment property through a UK Limited Company / SPV.

## Main features

- Purchase price, deposit and mortgage required
- England & Northern Ireland residential SDLT estimate
- Company / additional-property higher rates
- Optional non-resident SDLT surcharge
- Optional 17% corporate whole-price-rate treatment where qualifying relief is not assumed
- Solicitor, survey, mortgage, company and other purchase costs
- Unlimited custom expenses
- Refurbishment cost
- Total purchase costs and total cash required
- Local offline storage
- Supabase email/password sign-in
- Shared cloud property list restricted to approved workspace members
- Viewer, editor and administrator workspace roles
- Administrator-only permanent property deletion
- Soft-delete Archived Properties page with restore support
- Offline-first cloud sync; archived records remain stored locally and in Supabase
- GitHub Pages and iPhone PWA support

## Before deploying

For a new or replacement Supabase project follow **`SUPABASE_SETUP.md`** and run **`database-scripts/00 - Bootstrap Complete Schema.sql`**. Existing installations should apply newer numbered scripts from **`database-scripts/`** in order. See **`database-scripts/README.md`** for the migration policy.

1. Create a Supabase project and its first Auth account.
2. Run `database-scripts/00 - Bootstrap Complete Schema.sql` in the SQL Editor.
3. Review `workspace_members` and add only approved team accounts.
4. Copy the Project URL and Publishable key into `supabase-config.js`.
5. Upload this folder to GitHub Pages and verify sign-in and sync.

Do **not** put a Supabase Secret key or `service_role` key in this project.

## Cloud behaviour

The app remains offline-first:

- `localStorage` is used immediately when saving.
- When signed in and online, the property is stored in the shared Supabase workspace.
- Only active accounts listed in `workspace_members` can access cloud rows. Viewers can read; editors and administrators can save, archive and restore.
- The app syncs on sign-in/app return and periodically while visible. Server-controlled revisions prevent a stale device from overwriting a newer cloud edit; unsynced local work is retained when a conflict is detected.
- Archiving is a normal synced update using a `deleted_at` timestamp; restoring clears it.
- Legacy pending deletes from the older version are converted into archives during sync.
- Signing out leaves the local device copy intact.

## Deploy to GitHub Pages

1. Create a GitHub repository, for example `spv-property-calculator`.
2. Upload the **contents** of this folder to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and **/(root)**.
6. Open the generated GitHub Pages URL once while online.
7. On iPhone Safari, tap **Share → Add to Home Screen**.

All application paths are relative, so repository subdirectory URLs such as this are supported:

```text
https://username.github.io/spv-property-calculator/
```

## Local testing

The application uses browser modules so production and tests execute the same calculation code. Serve the folder through HTTP for local testing:

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080/
```

Service workers/PWA installation require HTTP(S), not `file://`.

## Tax configuration

Edit `tax-config.js` when tax rules change. Look for:

```text
UPDATE UK TAX RATES HERE
```

The bundled SDLT configuration is for England & Northern Ireland from 1 April 2025 and was checked on 12 August 2026.

## Tests

If Node.js is installed:

```bash
npm test
```

This runs the calculation tests, local storage tests and cloud merge tests.

## Important tax note

This is a planning estimator, not tax advice. Corporate property transactions can have special rules and reliefs, particularly for dwellings over £500,000. Confirm the correct tax treatment and transaction costs with qualified advisers before purchase.


## Archived Properties and permanent deletion

The main list uses soft-delete via **Archive**. Archived Properties provides **Restore Property** and **Permanently Delete**. Permanent deletion is online-only, requires the administrator role, removes the property data for all users, and records a small deletion tombstone to prevent stale offline caches from recreating it. Run the latest `supabase-schema.sql` before deploying this version.

## UI refresh (v1.5)

- The app icon/title in the sticky header now returns to the Home property list.
- **Sync now** is positioned directly beside **New Property** when a signed-in cloud session is available.
- The Home actions use a compact responsive action panel, with **Archived Properties** as a quieter secondary action.
- The service-worker cache is bumped to `v1.5.0-ui-refresh` so deployed PWAs can pick up the refreshed interface.
