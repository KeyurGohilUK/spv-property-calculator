import { test, expect } from '@playwright/test';
import { blockExternalServices } from './support/app-helpers.js';

async function addExpense(page, { amount = '125.50', description = 'Companies House filing fee', receipt } = {}) {
  await page.getByRole('button', { name: /Add Expense/i }).click();
  await page.locator('#expenseAmount').fill(amount);
  await page.locator('#expenseDescription').fill(description);
  if (receipt) await page.locator('#expenseReceipt').setInputFiles(receipt);
  await page.getByRole('button', { name: 'Save Expense' }).click();
  await expect(page.locator('#expenseDialog')).not.toHaveAttribute('open', '');
}

test.beforeEach(async ({ page }) => {
  await blockExternalServices(page);
});

test('More opens a modal without navigating and closes from the backdrop', async ({ page }) => {
  await page.goto('/expenses.html');
  const originalUrl = page.url();

  await page.getByRole('button', { name: 'More' }).click();
  await expect(page.getByRole('heading', { name: 'App Menu' })).toBeVisible();
  await expect(page).toHaveURL(originalUrl);

  await page.mouse.click(5, 5);
  await expect(page.getByRole('heading', { name: 'App Menu' })).toBeHidden();
  await expect(page).toHaveURL(originalUrl);
});

test('adds, edits by clicking the listing, and deletes an expense', async ({ page }) => {
  await page.goto('/expenses.html');
  await addExpense(page);

  await expect(page.locator('#expenseCount')).toHaveText('1');
  await expect(page.locator('.expense-card')).toContainText('£125.50');
  await expect(page.getByText('Companies House filing fee')).toBeVisible();

  await page.locator('.expense-card-main').click();
  await expect(page.getByRole('heading', { name: 'Edit Expense' })).toBeVisible();
  await page.locator('#expenseAmount').fill('150');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.locator('.expense-card')).toContainText('£150.00');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /Delete expense/i }).click();
  await expect(page.locator('#expenseCount')).toHaveText('0');
  await expect(page.getByRole('heading', { name: 'No expenses recorded' })).toBeVisible();
});

test('shows selected receipt size and keeps receipt metadata locally', async ({ page, browserName }) => {
  await page.goto('/expenses.html');
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
  await page.goto('/expenses.html');
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
  await page.goto('/expenses.html');
  await page.getByRole('button', { name: /Add Expense/i }).click();

  const dialog = await page.locator('#expenseDialog').boundingBox();
  const date = await page.locator('#expenseDate').boundingBox();
  expect(dialog && date).toBeTruthy();
  expect(date.x).toBeGreaterThanOrEqual(dialog.x);
  expect(date.x + date.width).toBeLessThanOrEqual(dialog.x + dialog.width + 1);
});
