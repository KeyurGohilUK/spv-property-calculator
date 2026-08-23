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
assert.match(expensePage, /TARGET_RECEIPT_SIZE = Math\.floor\(1\.5 \* 1024 \* 1024\)/, 'Receipt images should target approximately 1.5 MB');
assert.match(expensePage, /MAX_RECEIPT_IMAGE_DIMENSION = 2000/, 'Large receipt images must be resized');
assert.match(expensePage, /async function optimiseReceiptImage\(file\)[\s\S]*canvasToBlob\(canvas, 'image\/jpeg', quality\)[\s\S]*result\.size > MAX_RECEIPT_SIZE/, 'Receipt image optimisation is missing');
assert.match(expensePage, /Optimising receipt…[\s\S]*Receipt reduced from/, 'Receipt optimisation feedback is missing');
assert.match(expensePage, /file\.type === 'application\/pdf' && file\.size <= TARGET_RECEIPT_SIZE|file\.type === 'application\/pdf'/, 'PDF receipts must bypass image optimisation');
assert.match(expenseHtml, /Photos are automatically reduced below 2 MB/, 'Receipt guidance must explain automatic image reduction');
assert.match(expenseHtml, /accept="image\/\*,application\/pdf"/, 'Receipt picker must allow supported iPhone photos');
assert.match(expenseHtml, /id="expenseReceiptSize" class="receipt-file-size" aria-live="polite">No receipt selected<\/div>/, 'Visible receipt size status is missing');
assert.match(expensePage, /function updateReceiptSelectionDetails\(\)[\s\S]*Selected: \$\{file\.name\} · \$\{formatFileSize\(file\.size\)\}[\s\S]*will be optimised when saved[\s\S]*addEventListener\('input', updateReceiptSelectionDetails\)[\s\S]*addEventListener\('change', updateReceiptSelectionDetails\)/, 'Selected receipt details must update reliably on iOS');
assert.match(expensePage, /Current receipt: \$\{expense\.receipt\.name[\s\S]*formatFileSize\(expense\.receipt\.size\)/, 'Existing receipt details must display while editing');
assert.match(expensePage, /async function viewReceipt\(expense\)[\s\S]*window\.open\('', '_blank'\)[\s\S]*await getReceipt\(expense\.id\)[\s\S]*viewer\.location\.replace\(url\)/, 'Receipt viewer must open synchronously before IndexedDB access for iOS Safari');
assert.match(expensePage, /remove\.innerHTML = '<svg[\s\S]*Delete expense/, 'Expense delete action must use an accessible icon');
assert.match(expensePage, /view\.className = 'view-receipt'[\s\S]*view\.innerHTML = '<svg[\s\S]*View receipt/, 'Receipt view action must use an accessible icon');
assert.doesNotMatch(expensePage, /view\.textContent = 'View'/, 'Expense card must not display View text');
assert.doesNotMatch(expensePage, /remove\.textContent = 'Delete'/, 'Expense card must not show Delete text');
assert.match(expensePage, /function openForm\(expense = null\)/, 'Expense editor must support existing records');
assert.match(expensePage, /card\.addEventListener\('click', \(\) => openForm\(expense\)\)/, 'Clicking an expense card must open editing');
assert.match(expensePage, /card\.setAttribute\('role', 'button'\)/, 'Clickable expense cards must be keyboard accessible');
assert.doesNotMatch(expensePage, /edit\.className = 'edit-expense'/, 'Expense cards must not show a separate edit button');
assert.match(expensePage, /removeExpenseReceipt/, 'Expense editing must support receipt removal');
assert.match(expensePage, /expenseCategoryFilter[\s\S]*expenseDateFrom[\s\S]*expenseDateTo/, 'Category and date filters must be wired');
assert.doesNotMatch(expenseHtml, /separately from purchase estimates|separate from estimated property calculations/, 'Expense page must not repeat purchase-estimate separation wording');
assert.doesNotMatch(expenseHtml, /id="syncExpensesBtn"/, 'Expense page must not show a separate Sync now button');
assert.match(expenseHtml, /id="expenseSyncStatus" class="sync-status"/, 'Expenses must use the shared sync-status component');
assert.match(expensePage, /import \{ renderSyncStatus \} from '.\/sync-status\.js';[\s\S]*renderSyncStatus\(\$\('expenseSyncStatus'\), message, state\)/, 'Expense status updates must use the shared component');
assert.match(expenseHtml, /id="expenseMonthlyReport"[\s\S]*id="expenseCategoryReport"[\s\S]*id="expenseAllocationReport"/, 'Expense report breakdowns are missing');
assert.match(expenseHtml, /id="toggleExpenseFiltersBtn"[\s\S]*Filter &amp; Export/, 'Combined Filter & Export action is missing');
assert.match(expenseHtml, /id="expenseFilters"[\s\S]*id="exportExpensesBtn"/, 'CSV export must live inside the filter panel');
assert.match(expenseHtml, /id="expenseFilters"[\s\S]*id="exportExpensesBtn"[\s\S]*class="expense-report-card expense-report-inline"[\s\S]*id="expenseMonthlyReport"/, 'Expense Summary must live beneath the controls in the Filter & Export panel');
assert.match(expensePage, /function exportFilteredExpenses\(\)/, 'Filtered CSV export is not implemented');
assert.match(expensePage, /renderReports\(visible\)/, 'Reports must use the filtered expense list');
assert.equal((expenseHtml.match(/id="exportExpensesBtn"/g) || []).length, 1, 'Export action must not be duplicated in the report card');
assert.match(expenseHtml, /id="expenseDialog" class="install-dialog expense-dialog"/, 'Add/Edit Expense must use shared popup styling');
const expenseStyles = await import('node:fs').then((fs) => fs.readFileSync(new URL('./expenses.css', import.meta.url), 'utf8'));
assert.match(expenseStyles, /\.receipt-file-size \{[^}]*min-height: 38px;[^}]*overflow-wrap: anywhere;/, 'Receipt details must remain visible and wrap safely');
assert.match(expenseStyles, /\.expense-report-inline \{[\s\S]*grid-column: 1 \/ -1[\s\S]*box-shadow: none/, 'Nested Expense Summary must span the filter panel without a second shadow');
assert.doesNotMatch(expenseStyles, /\.expense-sync-status/, 'Expense page must not define a separate sync-status component');
assert.match(expenseStyles, /\.expense-form-grid > \.field \{ min-width: 0; \}/, 'Expense grid fields must be allowed to shrink');
assert.match(expenseStyles, /input\[type="date"\][\s\S]*min-width: 0[\s\S]*max-width: 100%/, 'Expense date input must stay within the iPhone popup');
assert.match(expenseStyles, /\.expense-dialog[\s\S]*overflow-x: hidden/, 'Expense popup must prevent horizontal overflow');
assert.match(expenseStyles, /\.expense-filters \.field \{ min-width: 0;/, 'Filter fields must be allowed to shrink');
assert.match(expenseStyles, /@media \(max-width: 620px\)[\s\S]*\.expense-filters \{ grid-template-columns: minmax\(0, 1fr\); \}/, 'Mobile expense filters must use one column');
assert.match(expenseStyles, /\.expense-filters input\[type="date"\][\s\S]*max-width: 100%/, 'Mobile filter dates must stay inside their container');
assert.match(expenseStyles, /@media \(max-width: 1100px\) and \(min-width: 621px\)[\s\S]*\.expense-filters \{ grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\); \}[\s\S]*\.expense-filter-actions \{ grid-column: 1 \/ -1; \}/, 'Tablet expense filters must use a two-column layout with full-width actions');
assert.match(expenseStyles, /\.expense-filters \.field \{[^}]*overflow: hidden;/, 'Filter fields must contain Safari date controls');
assert.match(expenseStyles, /\.expense-filters input\[type="date"\][\s\S]*inline-size: 100%[\s\S]*min-inline-size: 0[\s\S]*overflow: hidden[\s\S]*-webkit-appearance: none/, 'Safari date inputs must be constrained at every screen width');
assert.match(expenseStyles, /@media \(max-width: 820px\) and \(min-width: 621px\)[\s\S]*\.expense-filters \{ grid-template-columns: minmax\(0, 1fr\); \}/, 'Smaller iPads must stack expense filters in one column');
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
