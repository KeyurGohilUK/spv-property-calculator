import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value))
};

const { getExpenses, saveExpense, deleteExpense } = await import('./expense-storage.js');

const expensePage = await import('node:fs').then((fs) => fs.readFileSync(new URL('./expenses.js', import.meta.url), 'utf8'));
const expenseHtml = await import('node:fs').then((fs) => fs.readFileSync(new URL('./expenses.html', import.meta.url), 'utf8'));
assert.match(expensePage, /MAX_RECEIPT_SIZE = 2 \* 1024 \* 1024/, 'Receipt limit must remain 2 MB');
assert.match(expenseHtml, /maximum 2 MB/, 'Receipt guidance must display the 2 MB limit');
assert.match(expensePage, /remove\.innerHTML = '<svg[\s\S]*Delete expense/, 'Expense delete action must use an accessible icon');
assert.doesNotMatch(expensePage, /remove\.textContent = 'Delete'/, 'Expense card must not show Delete text');

const company = saveExpense({ amount: 42.5, date: '2026-08-23', category: 'Office & administration', scope: 'company', propertyId: 'ignored' });
assert.equal(company.scope, 'company');
assert.equal(company.propertyId, '');
assert.equal(company.amount, 42.5);

const property = saveExpense({ amount: 125, date: '2026-08-24', category: 'Repairs & maintenance', scope: 'property', propertyId: 'property-1' });
assert.equal(property.propertyId, 'property-1');
assert.deepEqual(getExpenses().map((item) => item.id), [property.id, company.id], 'Expenses should be newest-date first');
assert.equal(deleteExpense(company.id), true);
assert.deepEqual(getExpenses().map((item) => item.id), [property.id]);
assert.equal(deleteExpense('missing'), false);

console.log('Expense storage checks passed.');
