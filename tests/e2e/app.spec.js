import { test, expect } from '@playwright/test';
import { blockExternalServices } from './support/app-helpers.js';

async function addExpense(page, { amount = '125.50', description = 'Companies House filing fee', paidBy = 'company', receipt, scope, propertyId } = {}) {
  await page.getByRole('button', { name: /Add Expense/i }).click();
  if (scope) await page.locator('#expenseScope').selectOption(scope);
  if (propertyId) await page.locator('#expenseProperty').selectOption(propertyId);
  await page.locator('#expenseAmount').fill(amount);
  await page.locator('#expenseDescription').fill(description);
  await page.locator('#expensePaidBy').selectOption(paidBy);
  if (receipt) await page.locator('#expenseReceipt').setInputFiles(receipt);
  await page.getByRole('button', { name: 'Save Expense' }).click();
  await expect(page.locator('#expenseDialog')).not.toHaveAttribute('open', '');
}

test.beforeEach(async ({ page }) => {
  await blockExternalServices(page);
});

test('@mobile More menu stays inside a short viewport and scrolls its contents', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 480 });
  await page.goto('/');
  await page.locator('#moreNavBtn').click();

  const dialog = page.locator('#moreMenuDialog');
  await expect(dialog).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox.y).toBeGreaterThanOrEqual(0);
  expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(480);

  const lastItem = page.getByRole('link', { name: /Privacy & Terms/ });
  await lastItem.scrollIntoViewIfNeeded();
  const itemBox = await lastItem.boundingBox();
  expect(itemBox.y).toBeGreaterThanOrEqual(dialogBox.y);
  expect(itemBox.y + itemBox.height).toBeLessThanOrEqual(dialogBox.y + dialogBox.height);
});

test('More opens a modal without navigating and closes from the backdrop', async ({ page }) => {
  await page.goto('/expenses/');
  const originalUrl = page.url();

  await page.getByRole('button', { name: 'More' }).click();
  await expect(page.getByRole('heading', { name: 'App Menu' })).toBeVisible();
  await expect(page).toHaveURL(originalUrl);

  await page.mouse.click(5, 5);
  await expect(page.getByRole('heading', { name: 'App Menu' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'More' })).toBeFocused();
  await expect(page).toHaveURL(originalUrl);
});

test('adds, edits by clicking the listing, and deletes an expense', async ({ page }) => {
  await page.goto('/expenses/');
  await addExpense(page);

  await expect(page.locator('#expenseCount')).toHaveText('1');
  await expect(page.locator('.expense-card')).toContainText('£125.50');
  await expect(page.getByText('Companies House filing fee')).toBeVisible();

  await expect(page.locator('.expense-card')).not.toHaveAttribute('role', 'button');
  await expect(page.getByRole('button', { name: 'Edit expense Companies House filing fee' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit expense Companies House filing fee' }).click();
  await expect(page.getByRole('heading', { name: 'Edit Expense' })).toBeVisible();
  await page.locator('#expenseAmount').fill('150');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.locator('.expense-card')).toContainText('£150.00');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /Delete expense/i }).click();
  await expect(page.locator('#expenseCount')).toHaveText('0');
  await expect(page.getByRole('heading', { name: 'No expenses recorded' })).toBeVisible();
});

test('records and filters expenses by payer', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem(
    'spv-property-calculator.company-profile.v1',
    JSON.stringify({
      companyName: 'TG Property Invest Ltd',
      appointments: [
        { id: 'director-a', name: 'Alex Director', roles: ['director'] },
        { id: 'director-b', name: 'Sam Director', roles: ['director', 'shareholder'] }
      ]
    })
  ));
  await page.goto('/expenses/');
  await addExpense(page, { amount: '240', description: 'Survey paid personally', paidBy: 'appointment:director-a' });
  await addExpense(page, { amount: '80', description: 'Company filing fee', paidBy: 'company' });

  const personalExpense = page.locator('.expense-card').filter({ hasText: 'Survey paid personally' });
  await expect(personalExpense).toContainText('Paid by Alex Director');
  await personalExpense.getByRole('button', { name: 'Edit expense Survey paid personally' }).click();
  await page.locator('#expensePaidBy').selectOption('appointment:director-b');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(personalExpense).toContainText('Paid by Sam Director');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('spv-property-calculator.expenses.v1') || '[]'));
  expect(stored.find((expense) => expense.description === 'Survey paid personally')?.paidBy).toBe('appointment:director-b');

  await page.getByRole('button', { name: 'Filter & Export' }).click();
  await page.locator('#expensePaidByFilter').selectOption('appointment:director-b');
  await expect(page.locator('#expenseCount')).toHaveText('1');
  await expect(page.locator('.expense-card')).toContainText('Survey paid personally');
  await expect(page.locator('#expensePayerReport')).toContainText('Sam Director');
  await expect(page.locator('#expensePayerReport')).toContainText('£240.00');
});

test('selects expense allocation first and reveals a property only when needed', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('spv-property-calculator.company-profile.v1', JSON.stringify({
      companyName: 'TG Property Invest Ltd',
      appointments: [{ id: 'officer-1', name: 'Alex Director', roles: ['director'] }]
    }));
    localStorage.setItem('spv-property-calculator.properties.v1', JSON.stringify([
      { id: 'property-1', title: '55 Royal Road, Bristol' }
    ]));
  });
  await page.goto('/expenses/');
  await page.getByRole('button', { name: /Add Expense/i }).click();

  const selectOrder = await page.locator('#expenseForm').evaluate((form) =>
    [...form.querySelectorAll('select')].slice(0, 3).map((select) => select.id)
  );
  expect(selectOrder).toEqual(['expenseScope', 'expenseProperty', 'expensePaidBy']);
  await expect(page.locator('#expensePropertyField')).toBeHidden();
  await expect(page.locator('#expensePaidBy option').first()).toHaveText('TG Property Invest Ltd');

  await page.locator('#expenseScope').selectOption('property');
  await expect(page.locator('#expensePropertyField')).toBeVisible();
  await expect(page.locator('#expenseProperty option')).toHaveText(['Select property', '55 Royal Road, Bristol']);
  await expect(page.locator('#expensePaidBy option')).toHaveText([
    'TG Property Invest Ltd', 'Alex Director'
  ]);

  await page.locator('#expenseProperty').selectOption('property-1');
  await page.locator('#expensePaidBy').selectOption('appointment:officer-1');
  await page.locator('#expenseAmount').fill('35');
  await page.locator('#expenseDescription').fill('Property survey');
  await page.getByRole('button', { name: 'Save Expense' }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('spv-property-calculator.expenses.v1') || '[]')[0]);
  expect(saved).toMatchObject({
    scope: 'property', propertyId: 'property-1', paidBy: 'appointment:officer-1', amount: 35
  });
  const card = page.locator('.expense-card');
  await expect(card).toContainText('55 Royal Road, Bristol');
  await expect(card).toContainText('Paid by Alex Director');
});

test('shows selected receipt size and keeps receipt metadata locally', async ({ page, browserName }) => {
  await page.goto('/expenses/');
  const receipt = {
    name: 'test-receipt.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    )
  };

  await page.getByRole('button', { name: /Add Expense/i }).click();
  await page.locator('#expenseAmount').fill('20');
  await page.locator('#expenseDescription').fill('Test receipt');
  await page.locator('#expenseReceipt').setInputFiles(receipt);
  await expect(page.locator('#expenseReceiptSize')).toContainText('test-receipt.png');
  await expect(page.locator('#expenseReceiptSize')).toContainText(/\d+ (B|KB)/);

  // Linux WebKit cannot persist Playwright's synthetic File in IndexedDB.
  // WebKit still verifies selection and size display; Chromium exercises the
  // complete browser persistence journey, backed by receipt-storage unit tests.
  if (browserName === 'webkit') return;

  await page.getByRole('button', { name: 'Save Expense' }).click();

  await expect(page.locator('#expenseDialog')).not.toHaveAttribute('open', '');
  const storedReceipt = await page.evaluate(() => {
    const items = JSON.parse(localStorage.getItem('spv-property-calculator.expenses.v1') || '[]');
    return items[0]?.receipt || null;
  });
  expect(storedReceipt?.name).toMatch(/^test-receipt-\d{8}-\d{6}\.png$/);
  expect(storedReceipt?.type).toBe('image/png');
  expect(storedReceipt?.size).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: /View receipt/i })).toBeVisible();
});

test('@mobile iPad filter date fields remain inside the filter panel without overlapping', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'Responsive WebKit regression');
  await page.setViewportSize({ width: 1024, height: 1366 });
  await page.goto('/expenses/');
  await page.getByRole('button', { name: 'Filter & Export' }).click();

  const panel = await page.locator('#expenseFilters').boundingBox();
  const from = await page.locator('#expenseDateFrom').boundingBox();
  const to = await page.locator('#expenseDateTo').boundingBox();
  expect(panel && from && to).toBeTruthy();
  expect(from.x).toBeGreaterThanOrEqual(panel.x);
  expect(to.x).toBeGreaterThanOrEqual(panel.x);
  expect(from.x + from.width).toBeLessThanOrEqual(panel.x + panel.width + 1);
  expect(to.x + to.width).toBeLessThanOrEqual(panel.x + panel.width + 1);

  const horizontalOverlap = from.x < to.x + to.width && to.x < from.x + from.width;
  const verticalOverlap = from.y < to.y + to.height && to.y < from.y + from.height;
  expect(horizontalOverlap && verticalOverlap).toBe(false);
});

test('iPhone expense date input stays within the modal', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'Mobile WebKit regression');
  await page.goto('/expenses/');
  await page.getByRole('button', { name: /Add Expense/i }).click();

  const dialog = await page.locator('#expenseDialog').boundingBox();
  const date = await page.locator('#expenseDate').boundingBox();
  expect(dialog && date).toBeTruthy();
  expect(date.x).toBeGreaterThanOrEqual(dialog.x);
  expect(date.x + date.width).toBeLessThanOrEqual(dialog.x + dialog.width + 1);
});
