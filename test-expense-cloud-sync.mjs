import assert from 'node:assert/strict';
import fs from 'node:fs';

const cloud = fs.readFileSync(new URL('./cloud.js', import.meta.url), 'utf8');
const expenses = fs.readFileSync(new URL('./expenses.js', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('./expenses.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

assert.match(cloud, /async function listExpenses\(\)/, 'Cloud expense listing is missing');
assert.match(cloud, /async function upsertExpense\(record\)/, 'Cloud expense upsert is missing');
assert.match(cloud, /upsert_expense_if_current/, 'Expense writes must use the revision-safe RPC');
assert.match(cloud, /isExpenseConflict/, 'Expense conflict detection is missing');
assert.match(expenses, /function mergeExpenseSets/, 'Offline/cloud expense merge is missing');
assert.match(expenses, /getAllExpenses\(\)/, 'Sync must include local deletion tombstones');
assert.match(expenses, /Cloud setup required · run database Update 10/, 'Missing-schema guidance is required');
assert.match(page, /supabase-config\.js[\s\S]*cloud\.js[\s\S]*expenses\.js/, 'Expense page must load cloud dependencies before its module');
assert.match(page, /id="expenseSyncStatus"/, 'Expense sync status is missing');
assert.match(page, /stored on this device/, 'Receipt files must remain explicitly local');
assert.doesNotMatch(page, /id="syncExpensesBtn"/, 'Expense page must not duplicate the account Sync now action');
assert.match(app, /async function syncExpenseRecords\(\)/, 'Account sync must include expense records');
assert.match(app, /const expenseResult = await syncExpenseRecords\(\)/, 'Main cloud sync must await expense sync');
assert.match(app, /dialogSyncBtn.*syncCloud/s, 'Account popup Sync now must trigger the combined cloud sync');

console.log('Expense cloud sync checks passed.');
