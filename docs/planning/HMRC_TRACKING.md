# HMRC compliance (v1.60.0)

Company → Compliance → HMRC uses two short sections:

- **One-time setup:** UTR letter, company activity, and Corporation Tax registration when activity starts. Status and evidence can be edited by permitted workspace members.
- **Corporation Tax periods:** record multiple HMRC-confirmed tax accounting periods. Each period card shows estimated deadlines, CT600 submission details, tax liability, recorded payments, an outstanding balance, and its own HMRC payment reference (masked).
- **Dialogs:** record or update dates, CT600 details, payments, and attach documents. Confirmed receipts are stored in private R2 using existing compliance evidence keys. The same controls are disabled for viewers.

Do not duplicate HMRC checklist cards. Keep Companies House compliance independent.

## Tax rules and limitations

- Tax periods may not exceed 12 months. First-year accounts may require two CT600 periods. Dates should be checked against HMRC or accountant records.
- Standard small-company Corporation Tax payment is normally due 9 months and 1 day after period end, while filing is generally due 12 months after period end. These are **indicative** deadlines and different payment arrangements may apply.
- HMRC Corporation Tax payment references are 17 characters **and change by accounting period**. Do not infer one using a UTR suffix.
- Unknown liabilities remain unknown, not £0. Green means a manually recorded status, never independent HMRC verification.
- Payment confirmation is only shown after a user explicitly records HMRC confirmation. Filing and tax payment are independent.
- Company UTR is not entered into the guided form. The UTR letter can be attached privately via R2.
- Prior-period data remains in existing versioned company profiles synced using Supabase. No database migration or Worker modification is required.

## Verification

`npm test`, `npm run test:html` and `npm run test:e2e` (desktop and mobile WebKit) must pass before merging. Validate an empty company, dormant/preparing company, active company, multiple periods, unknown/known liabilities, partial payments, viewer role, and evidence uploads/downloads.
