import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value))
};

const { getExpenses, getAllExpenses, replaceExpenses, saveExpense, deleteExpense } = await import('./expense-storage.js');

const expensePage = await import('node:fs').then((fs) => fs.readFileSync(new URL('./expenses.js', import.meta.url), 'utf8'));
const expenseHtml = await import('node:fs').then((fs) => fs.readFileSync(new URL('./expenses.html', import.meta.url), 'utf8'));
assert.match(expensePage, /MAX_RECEIPT_SIZE = 2 \* 1024 \* 1024/, 'Receipt limit must remain 2 MB');
assert.match(expenseHtml, /maximum 2 MB/, 'Receipt guidance must display the 2 MB limit');
assert.match(expensePage, /remove\.innerHTML = '<svg[\s\S]*Delete expense/, 'Expense delete action must use an accessible icon');
assert.doesNotMatch(expensePage, /remove\.textContent = 'Delete'/, 'Expense card must not show Delete text');
assert.match(expensePage, /function openForm\(expense = null\)/, 'Expense editor must support existing records');
assert.match(expensePage, /card\.addEventListener\('click', \(\) => openForm\(expense\)\)/, 'Clicking an expense card must open editing');
assert.match(expensePage, /card\.setAttribute\('role', 'button'\)/, 'Clickable expense cards must be keyboard accessible');
assert.doesNotMatch(expensePage, /edit\.className = 'edit-expense'/, 'Expense cards must not show a separate edit button');
assert.match(expensePage, /removeExpenseReceipt/, 'Expense editing must support receipt removal');
assert.match(expensePage, /expenseCategoryFilter[\s\S]*expenseDateFrom[\s\S]*expenseDateTo/, 'Category and date filters must be wired');
assert.doesNotMatch(expenseHtml, /separately from purchase estimates|separate from estimated property calculations/, 'Expense page must not repeat purchase-estimate separation wording');
assert.doesNotMatch(expenseHtml, /id="syncExpensesBtn"/, 'Expense page must not show a separate Sync now button');
assert.match(expenseHtml, /id="expenseMonthlyReport"[\s\S]*id="expenseCategoryReport"[\s\S]*id="expenseAllocationReport"/, 'Expense report breakdowns are missing');
assert.match(expenseHtml, /id="exportExpensesBtn"/, 'CSV export action is missing');
assert.match(expensePage, /function exportFilteredExpenses\(\)/, 'Filtered CSV export is not implemented');
assert.match(expensePage, /renderReports\(visible\)/, 'Reports must use the filtered expense list');
assert.match(expenseHtml, /id="expenseDialog" class="install-dialog expense-dialog"/, 'Add/Edit Expense must use shared popup styling');
assert.match(expenseHtml, /class="dialog-close expense-dialog-close"/, 'Expense popup must use the shared close control');
assert.match(expenseHtml, /id="expenseFilters"[\s\S]*id="expenseCategoryFilter"[\s\S]*id="expenseDateFrom"[\s\S]*id="expenseDateTo"/, 'Expense filter controls are missing');

const company = saveExpense({ amount: 42.5, date: '2026-08-23', category: 'Office & administration', scope: 'company', propertyId: 'ignored' });
assert.equal(company.scope, 'company');
assert.equal(company.propertyId, '');
assert.equal(company.amount, 42.5);
assert.equal(company._cloudDirty, true);
assert.equal(company._cloudRevision, 0);

const property = saveExpense({ amount: 125, date: '2026-08-24', category: 'Repairs & maintenance', scope: 'property', propertyId: 'property-1' });
assert.equal(property.propertyId, 'property-1');
assert.deepEqual(getExpenses().map((item) => item.id), [property.id, company.id], 'Expenses should be newest-date first');
assert.equal(deleteExpense(company.id), true);
assert.deepEqual(getExpenses().map((item) => item.id), [property.id]);
const deletedCompany = getAllExpenses().find((item) => item.id === company.id);
assert.ok(deletedCompany.deletedAt, 'Deleted expenses must remain as sync tombstones');
assert.equal(deletedCompany._cloudDirty, true);
replaceExpenses(getAllExpenses().map((item) => ({ ...item, _cloudDirty: false })));
assert.equal(getAllExpenses().every((item) => item._cloudDirty === false), true);
assert.equal(deleteExpense('missing'), false);

console.log('Expense storage checks passed.');
