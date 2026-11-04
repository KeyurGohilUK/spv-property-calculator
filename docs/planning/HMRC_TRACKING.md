# HMRC Compliance Tracking (v1.59)

Company → Compliance → HMRC is a **manual record-keeping tool**, not an HMRC filing service.

## Sections

- **Company Tax Setup:** note the date you received the UTR letter, Corporation Tax registration acknowledgement/date, a non-sensitive reference and accountant name. **Do not enter or store the 10-digit UTR here.** Attach the letter to the existing UTR compliance item using private Cloudflare R2 instead.
- **Tax accounting periods:** retain the existing confirmed period input and HMRC deadline estimates. The period details should be checked with HMRC or the accountant.
- **CT600 filing:** for each recorded tax period, store a submission date, acknowledgement reference, liability, accountant review date and reviewer name. Dates and references are self-recorded, not independently verified.
- **Payments:** maintain individual Corporation Tax payment dates, amounts and references for the selected period; the dashboard sums recorded payments and shows liability less payments, or unknown where no liability has been recorded.
- **Evidence:** attach CT600 acknowledgement and payment confirmation documents to the relevant period's existing HMRC compliance obligation. These are private R2 files with metadata on the existing company profile.

## Data and deployment

No new Supabase database objects are needed. All fields are nested in the existing versioned `company_profiles.details.hmrc` JSON document and synchronised through the existing company RPC, including period-specific payment records. No new R2 endpoint or bucket is required. The browser stores normalised records in the existing local company profile.

The feature does not submit CT600 returns, pay taxes, validate UTR identifiers, check HMRC accounts, or automatically mark a requirement as officially complete. Suggested deadlines remain estimates; accountant confirmation should be checked independently.

## Verification

Run `node tests/test-hmrc-tracking.mjs`, `npm test`, `npm run test:html` and `npm run test:e2e`. Test both editing and viewer access, multiple tax periods, partial payments, record persistence after refresh, and R2 evidence attachment to a chosen period.

## Guided HMRC interface (v1.59.1)

Only the current step is shown. Completed steps appear as small editable navigation items rather than expanding all tax forms at once.

1. **UTR letter** — record the received date or choose *Still waiting*. A pending letter is saved as pending, not complete.
2. **Company activity** — preparing to buy, business activity started, or HMRC-confirmed dormant. Preparing/dormant stops the wizard here until the status changes; this does not remove any Companies House obligations.
3. **Corporation Tax registration** — record HMRC confirmation or choose *Not yet confirmed*. Pending registration is flagged, and period recording remains available when activity has started.
4. **Tax accounting period** — record dates checked with HMRC or the accountant.
5. **Returns and payments** — separately expandable CT600 and payment forms; no filing-first requirement, since Corporation Tax payment may be due earlier.

All HMRC compliance obligations and their R2 attachments remain available in the collapsed **All HMRC requirements and evidence** section. Due-soon/past-due HMRC notices appear above the wizard even if earlier documents are pending. A recorded answer is not treated as official verification. The user can return to previous steps to correct dates/status.

No database migration, R2 change or new recurring charge is required. Existing `company_profiles.details.hmrc.setup` stores the two additional guide answers and stays covered by versioned company sync. Test with `node tests/test-hmrc-guided.mjs`, CI and the browser HMRC journey.
