# Companies House deadline lookup — deployment and migration runbook

This document is the repeatable deployment guide for the Companies House Public Data REST API integration. Keep API keys and Supabase passwords in secret managers, **never in Git, screenshots or client JavaScript**.

## Architecture and prerequisites

- Frontend: static SPV Property Calculator PWA (GitHub Pages) which invokes the Supabase function via the signed-in user's session.
- Backend: `supabase/functions/company-house-lookup/index.ts`, a Supabase Edge Function.
- Secrets: `COMPANIES_HOUSE_API_KEY` (a live **REST API** key from [Companies House Developer Hub](https://developer.company-information.service.gov.uk/)), stored in **Supabase → Edge Functions → Secrets**.
- Access control: a valid Supabase user JWT and active membership of `workspace_members`; the API key stays server-side.
- Database: the lookup does not introduce schema changes. The surrounding app needs the existing Supabase schema and authorised workspace users.

## Initial deployment from Windows / VS Code

1. Open the `spv-property-calculator` repository folder in VS Code and choose **Terminal → New Terminal** (PowerShell).
2. Check that `supabase/functions/company-house-lookup/index.ts` exists in the current checkout. This function must be merged from the feature PR or the correct feature branch checked out before deployment.
3. Ensure Node.js and npm are installed: `node --version` and `npm --version`.
4. In the Supabase Dashboard, open the **intended project → Edge Functions → Secrets** and add the name `COMPANIES_HOUSE_API_KEY` with the raw Companies House REST API key as its value. Do not prefix the value with `Bearer` or `Basic`.
5. Run the commands below. The **project ref is an environment-specific identifier**; replace it with the intended Supabase project's ref. It is **not** the Companies House company number.

```powershell
Test-Path .\supabase\functions\company-house-lookup\index.ts
npx supabase login
npx supabase projects list
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy company-house-lookup --use-api
npx supabase functions list
npx supabase secrets list
```

`--use-api` allows deployment without a local Docker engine. Check the deployed function in **Supabase → Edge Functions → company-house-lookup → Logs**. A successful deployment alone does **not** prove a successful authenticated live API call.

## Verify the live integration

1. Confirm the function appears in the intended Supabase project's **Edge Functions** list, and the secret **name** appears in **Secrets** (the secret value should not be visible).
2. Verify the frontend is configured for **the same Supabase project** and the Companies House feature has been merged and deployed.
3. Sign in as an active workspace member, open **Company Management**, and save a valid eight-character company number.
4. Open **Company Compliance**. Verify the **annual accounts** and **confirmation statement** deadline dates against that company's public Companies House record.
5. Check an incorrect company number, missing secret, unauthorised/disabled workspace user, a signed-out session, and offline mode. The app must show unavailable or unverified data, not a guessed deadline or a false filing-confirmation status.
6. Verify user-confirmed obligations remain explicitly **user confirmed**, not officially verified. HMRC deadlines are not provided by this integration.

### Troubleshooting

- **Function not found / 404:** the function wasn't deployed to the project currently configured in the frontend.
- **Lookup unavailable / 503:** verify `COMPANIES_HOUSE_API_KEY` exists in the *target* Supabase project and is a live REST key; check Edge Function logs.
- **401 / 403:** check login state and `workspace_members` active access; don't disable authentication to bypass the error.
- **API error / 502:** inspect function logs, network status and Companies House API availability; do not expose credentials in logs.
- **Old website behaviour:** confirm the PR is merged, the GitHub Pages release is deployed and the PWA has updated its cached assets.

## Moving to a new Supabase project or hosting provider

The function and deployment commands are version-controlled, but **secrets, authentication users, database data, storage and configuration are not automatically migrated by deploying this function**.

1. **Inventory and back up first.** Follow [Supabase setup](SUPABASE_SETUP.md), [database guidance](../../database/README.md), and other service setup guides. Create and independently verify a database backup/export; assess Auth users, RLS/workspace membership, storage buckets/objects, receipts, scheduled jobs, webhooks, push subscriptions and any provider-specific configuration.
2. **Create the destination project** and apply the complete schema or ordered migrations, as appropriate. Verify workspace RLS roles and authenticated users before a public cutover.
3. **Re-create every required secret in the destination project** through its secrets UI/secure CLI (including `COMPANIES_HOUSE_API_KEY`); verify each dependent Edge Function, scheduled job and external service separately. Never copy secrets into repository files.
4. **Link and deploy the function to the new project** using `npx supabase link --project-ref NEW_PROJECT_REF` and `npx supabase functions deploy company-house-lookup --use-api`.
5. **Reconfigure frontend environment**: update the public Supabase project URL and publishable/anon key in the app's supported configuration workflow; update provider/webhook URLs as required. Do not commit private or service-role keys.
6. **Run end-to-end verification** on the new project (authentication, permissions, company profile sync, deadlines, offline fallback, other app modules). Plan a cutover/rollback window and keep the old environment intact until data and user access are verified.

**Important:** Changing a Supabase project is more than redeploying this one function. A new project generally requires deliberate data/auth migration and a coordinated frontend configuration change. Confirm production backup, restore and rollback procedures before redirecting users.

## Maintenance

The lookup retrieves public Companies House deadline fields only. It cannot verify that accounts were filed, that a confirmation statement was submitted or that Corporation Tax was paid. If the UI, Edge Function source or authentication settings change, redeploy the function where appropriate and rerun the tests. Avoid frequent polling; consider rate limiting and short caching before scaling.
