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
