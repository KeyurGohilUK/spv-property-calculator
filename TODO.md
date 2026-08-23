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
