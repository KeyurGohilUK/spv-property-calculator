import assert from 'node:assert/strict';
import fs from 'node:fs';

const bootstrap = fs.readFileSync(new URL('./database-scripts/00 - Bootstrap Complete Schema.sql', import.meta.url), 'utf8');
const expenseMigration = fs.readFileSync(new URL('./database-scripts/Update 10 - Expense Tracker.sql', import.meta.url), 'utf8');
const receiptMigration = fs.readFileSync(new URL('./database-scripts/Update 11 - Private R2 Receipts.sql', import.meta.url), 'utf8');
const revisionRepair = fs.readFileSync(new URL('./database-scripts/Update 12 - Repair Revision Sync Schema.sql', import.meta.url), 'utf8');
const receiptWorker = fs.readFileSync(new URL('./cloudflare/receipt-worker/src/index.js', import.meta.url), 'utf8');
const workerConfig = fs.readFileSync(new URL('./cloudflare/receipt-worker/wrangler.jsonc', import.meta.url), 'utf8');
const migrationGuide = fs.readFileSync(new URL('./database-scripts/README.md', import.meta.url), 'utf8');

for (const table of ['workspace_members', 'properties', 'property_notes', 'property_deletions', 'expenses']) {
  assert.match(bootstrap, new RegExp(`create table if not exists public\\.${table}`), `Bootstrap is missing ${table}`);
}
assert.match(bootstrap, /enable row level security/g, 'Bootstrap must enable RLS');
assert.match(bootstrap, /upsert_property_if_current/, 'Bootstrap must include conflict-safe property writes');
assert.match(bootstrap, /upsert_expense_if_current/, 'Bootstrap must include conflict-safe expense writes');
assert.match(expenseMigration, /create table if not exists public\.expenses/, 'Update 10 must create expenses');
assert.match(expenseMigration, /expenses_scope_property_check/, 'Expense scope/property integrity check missing');
assert.match(receiptMigration, /add column if not exists receipt_object_path/, 'Update 11 must preserve a private R2 object key');
assert.match(receiptMigration, /expenses_receipt_object_path_check/, 'Update 11 must constrain R2 object keys');
assert.match(revisionRepair, /alter table public\.properties[\s\S]*add column if not exists revision bigint/, 'Update 12 must safely repair the property revision column');
assert.match(revisionRepair, /alter table public\.expenses[\s\S]*add column if not exists revision bigint/, 'Update 12 must safely repair the expense revision column');
assert.match(revisionRepair, /create or replace function public\.upsert_property_if_current/, 'Update 12 must restore conflict-safe property writes');
assert.match(receiptMigration, /grant execute on function public\.is_workspace_member\(\), public\.is_workspace_editor\(\) to authenticated/, 'Worker access-check functions must be available to authenticated users');
assert.match(bootstrap, /expenses_receipt_object_path_idx/, 'Bootstrap must include the receipt object-path index');
assert.match(receiptWorker, /requireWorkspaceAccess[\s\S]*is_workspace_editor[\s\S]*env\.RECEIPTS\.put[\s\S]*env\.RECEIPTS\.get[\s\S]*env\.RECEIPTS\.delete/, 'Private R2 Worker access controls are incomplete');
assert.match(receiptWorker, /MAX_RECEIPT_SIZE = 2 \* 1024 \* 1024/, 'Worker must enforce the 2 MB receipt limit');
assert.doesNotMatch(receiptWorker, /service_role|R2_ACCESS_KEY|R2_SECRET/, 'Worker source must not contain privileged credentials');
assert.match(workerConfig, /"binding": "RECEIPTS"[\s\S]*"bucket_name": "spv-property-receipts"/, 'Worker must use the configured private R2 binding');
assert.match(migrationGuide, /Never edit an already-deployed numbered migration/, 'Migration immutability rule missing');

console.log('Database bootstrap and migration checks passed.');
