# Product TODO

## Next feature

- Build the actual-expense tracker as a separate ledger from estimated property calculations.
- Support general company expenses and property-specific expenses.
- Keep required entry fields minimal and add receipt uploads in a later expense phase.

## Test coverage

- Add Playwright browser tests after the Expenses MVP is established.
- Cover mobile navigation, property create/edit/save, calculations, duplicate/archive/restore, unsaved changes and offline PWA loading.
- Use a dedicated or mocked Supabase environment for authenticated and multi-device browser journeys.

## Later improvements

- Expense receipt uploads using private Supabase Storage.
- Estimated-versus-actual reporting without modifying estimated calculations.
- Accountant-friendly CSV export and backup.

## Database deployment automation

- Establish the existing production Supabase schema as the migration baseline.
- Store future migrations under `supabase/migrations/` using Supabase's timestamped naming convention.
- Validate database migrations in CI for pull requests without connecting to production.
- After changes merge to `main`, deploy pending migrations with `supabase db push` through a protected `production` GitHub environment.
- Require manual approval before production deployment, keep Supabase credentials in environment secrets and prevent concurrent migration runs.
- Run a dry-run check before each production migration deployment and keep Update 21 as a manual migration until the baseline workflow is established.
