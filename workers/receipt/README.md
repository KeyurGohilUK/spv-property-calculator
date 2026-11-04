# Private R2 receipt Worker

This Worker stores SPV expense receipts in the private `spv-property-receipts` R2 bucket.

## Required Cloudflare configuration

- R2 binding: `RECEIPTS` → `spv-property-receipts`
- Public bucket access must remain disabled.
- Variables: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `ALLOWED_ORIGINS`.
- Production URL: `https://spv-receipt-service.keyurgohil-uk.workers.dev`

Never add a Supabase secret/service-role key or R2 API credentials to this repository.

Every request validates the Supabase access token. Downloads require `is_workspace_member()`; uploads and deletes require `is_workspace_editor()`. Run `database/migrations/Update 11 - Private R2 Receipts.sql` before testing authenticated routes.

## Routes

- `GET /health`
- `PUT /receipts/:expenseId`
- `GET /receipts/:expenseId?key=receipts/...`
- `DELETE /receipts/:expenseId?key=receipts/...`

Uploads accept PDF, JPEG, PNG, WebP, HEIC and HEIF up to 2 MB.

## Automatic GitHub Actions deployment

Workflow: [Deploy Cloudflare R2 Worker](../../.github/workflows/deploy-cloudflare-worker.yml).

After a push/merge to `main`, GitHub's **CI** workflow runs unit tests and Playwright. When CI succeeds, the Cloudflare deployment workflow checks whether `workers/receipt/` changed in that commit and deploys the existing `spv-receipt-service` Worker automatically. A CI failure prevents deployment; older runs cannot overwrite a newer `main` revision. The workflow also supports **Actions → Deploy Cloudflare R2 Worker → Run workflow**, including manual redeployment of the existing Worker.

**One-time configuration:** In GitHub → Settings → Environments → `production`, configure the following environment secrets (do not commit values):

- `CLOUDFLARE_API_TOKEN`: create a Cloudflare API token restricted to the intended account and Workers deployment permissions. It needs access to deploy this Worker and its existing R2 binding; use the least privileges supported by Cloudflare.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID containing `spv-receipt-service`.

The workflow uses `cloudflare/wrangler-action@v4` from `workers/receipt/` and verifies `https://spv-receipt-service.keyurgohil-uk.workers.dev/health`. Existing Cloudflare dashboard-managed variables (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `ALLOWED_ORIGINS`) remain configured in Cloudflare; `keep_vars: true` in `wrangler.jsonc` preserves them. **Do not copy Supabase credentials into GitHub or change the R2 bucket binding.** The `RECEIPTS` binding must continue pointing to `spv-property-receipts`.

The health check only confirms that the Worker responds; after initial automation setup, verify an authenticated receipt and compliance evidence upload/download and check GitHub Actions job logs (without exposing secrets). If secrets are not configured, the deployment job fails with setup instructions, rather than publishing anonymously.

### Manual fallback

If GitHub Actions is unavailable, you can still deploy manually from this directory with `npx wrangler deploy` after `npx wrangler login`.

## Company compliance evidence (v1.58)

The same private R2 bucket now stores compliance evidence under a separate prefix:
`compliance/{companyId}/{fileUuid}.{ext}`.
This does not change the `receipts/` storage contract.

- `PUT /compliance/:companyId/:fileUuid` uploads a PDF/image up to **5 MB** (approved editor/admin only).
- `GET /compliance/:companyId/:fileUuid?key=compliance/...` downloads an attachment (approved workspace member).
- `DELETE /compliance/:companyId/:fileUuid?key=compliance/...` deletes an attachment (approved editor/admin).
- The same Supabase bearer authentication, origin allowlist, private `RECEIPTS` bucket and worker URL are reused.
- The app stores **metadata and private object paths** in the relevant versioned Supabase company profile, not binary files in Postgres.
- Download responses force `Content-Disposition: attachment` and `nosniff`. Company-deletion tombstones do not automatically delete stored evidence; retention/purge must be planned separately.

### Deploy this Worker version

**Cloudflare Worker deployment now runs automatically after successful main CI when Worker files change**, once its GitHub `production` secrets are set. For an immediate redeployment, use the workflow's manual Run workflow option. A local fallback is:

```powershell
cd workers/receipt
npx wrangler login
npx wrangler deploy
```

The Wrangler configuration sets `keep_vars: true` so existing dashboard-managed `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `ALLOWED_ORIGINS` variables are preserved during deployment. Verify these bindings and the receipt upload/download flow immediately after deployment.

Use the existing Cloudflare account and Worker, not a new storage service. The `RECEIPTS` binding must still point to `spv-property-receipts`. No extra Supabase database migration, R2 bucket or API key is required. Do not commit Cloudflare credentials. Check `GET /health` afterwards and test one small document end to end in the app. Without this Worker deployment the new evidence controls will return 404.

### Estimated incremental storage cost

At low volumes the added documents are expected to remain within R2's shared free Standard storage allowance; always verify actual total account usage (including receipts), request counts and current Cloudflare billing terms before relying on zero cost. This feature itself creates no paid subscription.
