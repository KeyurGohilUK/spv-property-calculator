import assert from 'node:assert/strict';
import fs from 'node:fs';

const bootstrap = fs.readFileSync(new URL('./database-scripts/00 - Bootstrap Complete Schema.sql', import.meta.url), 'utf8');
const expenseMigration = fs.readFileSync(new URL('./database-scripts/Update 10 - Expense Tracker.sql', import.meta.url), 'utf8');
const migrationGuide = fs.readFileSync(new URL('./database-scripts/README.md', import.meta.url), 'utf8');

for (const table of ['workspace_members', 'properties', 'property_notes', 'property_deletions', 'expenses']) {
  assert.match(bootstrap, new RegExp(`create table if not exists public\\.${table}`), `Bootstrap is missing ${table}`);
}
assert.match(bootstrap, /enable row level security/g, 'Bootstrap must enable RLS');
assert.match(bootstrap, /upsert_property_if_current/, 'Bootstrap must include conflict-safe property writes');
assert.match(bootstrap, /upsert_expense_if_current/, 'Bootstrap must include conflict-safe expense writes');
assert.match(expenseMigration, /create table if not exists public\.expenses/, 'Update 10 must create expenses');
assert.match(expenseMigration, /expenses_scope_property_check/, 'Expense scope/property integrity check missing');
assert.match(migrationGuide, /Never edit an already-deployed numbered migration/, 'Migration immutability rule missing');

console.log('Database bootstrap and migration checks passed.');
