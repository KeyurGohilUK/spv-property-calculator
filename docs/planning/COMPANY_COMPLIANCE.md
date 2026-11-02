# Company compliance foundation (Phase 1)

This first PR introduces a tested, pure compliance rules engine under `src/features/company/`.
It does **not** claim to submit HMRC or Companies House filings or verify payments.

- Rules distinguish unconditional obligations from conditional ones (VAT, PAYE, ICO, etc.).
- Companies House deadline fields (`accounts.next_due` and `confirmation_statement.next_due`) are accepted as inputs; this phase does not make API requests.
- A status of `user-confirmed` means only that a user has confirmed the action, not that an authority has independently verified it.
- Recurring task keys include the due-date period. The next filing cycle cannot inherit the previous cycle's confirmation.
- Missing HMRC dates and evidence remain `needs-verification`.
- `past-deadline-unverified` is not a legal conclusion that a filing was missed.
- Company records and individual director checks are not represented as successfully compliant without confirmation.

## Next PRs

Connect the engine to the Company Management UI, shared persistence and access controls; integrate the Companies House API on a server-side gateway; add deadline reminders and audit history.

## Validation

Run `node tests/test-company-compliance.mjs` and `npm test`, plus the repository's HTML and Playwright suites before marking a user-visible integration ready.
