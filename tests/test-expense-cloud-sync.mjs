import assert from 'node:assert/strict';
import fs from 'node:fs';

const cloud = fs.readFileSync(new URL('../cloud.js', import.meta.url), 'utf8');
const expenses = fs.readFileSync(new URL('../expenses.js', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../expenses/index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const secondaryHeader = fs.readFileSync(new URL('../secondary-page-header.js', import.meta.url), 'utf8');
const sharedSync = fs.readFileSync(new URL('../expense-cloud-sync.js', import.meta.url), 'utf8');
const workspaceSync = fs.readFileSync(new URL('../workspace-sync.js', import.meta.url), 'utf8');

assert.match(cloud, /async function listExpenses\(\)/, 'Cloud expense listing is missing');
assert.match(cloud, /async function upsertExpense\(record\)/, 'Cloud expense upsert is missing');
assert.match(cloud, /upsert_expense_if_current/, 'Expense writes must use the revision-safe RPC');
assert.match(cloud, /isExpenseConflict/, 'Expense conflict detection is missing');
assert.match(cloud, /receiptObjectPath: row\.receipt_object_path \|\| ''/, 'Cloud expenses must restore the private R2 object key');
assert.match(cloud, /p_receipt_object_path: record\.receiptObjectPath \|\| null/, 'Expense writes must persist the private R2 object key');
assert.match(cloud, /receipt_metadata,receipt_object_path,created_at/, 'Expense reads must select the private R2 object key');
assert.match(sharedSync, /function mergeExpenseWorkspace/, 'Shared offline/cloud expense merge is missing');
assert.match(sharedSync, /getAllExpenses\(\)/, 'Shared sync must include local deletion tombstones');
assert.match(sharedSync, /prepareExpenseReceiptForSync\(item, getReceipt\)/, 'Shared sync must prepare pending R2 receipt work');
assert.match(sharedSync, /activeExpenseSync/, 'Shared sync must serialize overlapping requests');
assert.match(page, /supabase-config\.js[\s\S]*cloud\.js[\s\S]*expenses\.js/, 'Expense page must load cloud dependencies before its module');
assert.match(page, /id="expenseSyncStatus"/, 'Expense sync status is missing');
assert.match(page, /kept locally and securely synced when signed in/, 'Receipt guidance must explain offline and private cloud storage');
assert.match(expenses, /syncExpenseWorkspace\(cloud\)/, 'Expense page must use the shared expense service');
assert.match(workspaceSync, /syncExpenses: syncExpenseWorkspace/, 'Workspace sync must use the shared expense service');
assert.match(app, /syncWorkspace\(window\.SPVCloud\)/, 'Main Account must use the shared workspace sync engine');
assert.match(secondaryHeader, /syncWorkspaceData\(window\.SPVCloud\)/, 'Secondary-page Account must use the shared workspace sync engine');
assert.doesNotMatch(page, /id="syncExpensesBtn"/, 'Expense page must not duplicate the account Sync now action');
assert.match(app, /dialogSyncBtn.*syncCloud/s, 'Account popup Sync now must trigger the combined cloud sync');

console.log('Expense cloud sync checks passed.');
