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

## Deploy

Run `npx wrangler deploy` from this directory, or paste `src/index.js` into the existing Worker dashboard editor and deploy.

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

**Important:** Supabase Edge Function CI/CD does not deploy Cloudflare Workers. Merge and deploy this Worker to enable the new `/compliance/` routes:

```powershell
cd workers/receipt
npx wrangler login
npx wrangler deploy
```

Use the existing Cloudflare account and Worker, not a new storage service. The `RECEIPTS` binding must still point to `spv-property-receipts`. No extra Supabase database migration, R2 bucket or API key is required. Do not commit Cloudflare credentials. Check `GET /health` afterwards and test one small document end to end in the app. Without this Worker deployment the new evidence controls will return 404.

### Estimated incremental storage cost

At low volumes the added documents are expected to remain within R2's shared free Standard storage allowance; always verify actual total account usage (including receipts), request counts and current Cloudflare billing terms before relying on zero cost. This feature itself creates no paid subscription.
