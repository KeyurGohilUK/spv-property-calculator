import { test, expect } from '@playwright/test';
import { blockExternalServices, createProperty } from './support/app-helpers.js';

test.beforeEach(async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Logic is browser-independent; mobile layout has dedicated WebKit coverage');
  await blockExternalServices(page);
});

test('property validation blocks incomplete records and identifies both required fields', async ({ page }) => {
  await page.goto('/');
  await page.locator('#newPropertyBtn').click();
  await page.locator('#savePropertyBtn').click();

  await expect(page.locator('#titleError')).toBeVisible();
  await expect(page.locator('#priceError')).toBeVisible();
  await expect(page.locator('#editorView')).not.toHaveClass(/hidden/);
  await expect(page.locator('#propertyCount')).toHaveText('0');
});

test('deposit slider updates deposit, mortgage and total cash immediately', async ({ page }) => {
  await page.goto('/');
  await page.locator('#newPropertyBtn').click();
  await page.locator('#title').fill('Deposit Slider');
  await page.locator('#purchasePrice').fill('250000');
  await page.locator('#depositPercent').fill('40');

  await expect(page.locator('#depositPercentValue')).toHaveText('40%');
  await expect(page.locator('#summaryDeposit')).toHaveText('£100,000');
  await expect(page.locator('#summaryMortgage')).toHaveText('£150,000');
  await expect(page.locator('#summaryTotalCash')).toHaveText('£115,000');
});

test('non-resident SDLT surcharge changes a known £250,000 calculation', async ({ page }) => {
  await page.goto('/');
  await page.locator('#newPropertyBtn').click();
  await page.locator('#title').fill('Non Resident SDLT');
  await page.locator('#purchasePrice').fill('250000');
  await expect(page.locator('#summarySDLT')).toHaveText('£15,000');

  const taxSection = page.locator('#nonResident').locator('xpath=ancestor::details[1]');
  await taxSection.locator(':scope > summary').click();
  await page.locator('#nonResident').check();
  await expect(page.locator('#summarySDLT')).toHaveText('£20,000');
  await expect(page.locator('#summaryTotalCash')).toHaveText('£82,500');
});

test('duplicate property creates an independent copy with the same values', async ({ page }) => {
  await createProperty(page, { title: 'Original Investment', price: '280000' });

  await page.getByRole('button', { name: 'Duplicate Original Investment' }).click();
  await expect(page.locator('#propertyCount')).toHaveText('2');
  await expect(page.getByRole('heading', { name: 'Original Investment', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Original Investment.*Copy/i })).toBeVisible();

  const cards = page.locator('.property-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('£280,000');
  await expect(cards.nth(1)).toContainText('£280,000');
});

test('past viewing date is represented as Viewed on the property card', async ({ page }) => {
  await page.goto('/');
  await page.locator('#newPropertyBtn').click();
  await page.locator('#title').fill('Completed Viewing');
  await page.locator('#purchasePrice').fill('210000');
  await page.locator('#viewingDate').fill('2020-01-01T10:30');
  await page.locator('#savePropertyBtn').click();
  await page.locator('#backBtn').click();

  const card = page.locator('.property-card').filter({ hasText: 'Completed Viewing' });
  await expect(card.getByText('Viewed', { exact: true })).toBeVisible();
  await expect(card).not.toContainText('1 Jan 2020');
});

test('properties survive a full browser reload from offline storage', async ({ page }) => {
  await createProperty(page, { title: 'Persistent Property', price: '325000' });
  await page.reload();

  const card = page.locator('.property-card').filter({ hasText: 'Persistent Property' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('£325,000');
  await expect(page.locator('#propertyCount')).toHaveText('1');
});

test('expense validation requires an amount and a selected property', async ({ page }) => {
  await createProperty(page, { title: 'Allocated Property', price: '200000' });
  await page.goto('/expenses.html');

  await page.getByRole('button', { name: /Add Expense/i }).click();
  await page.locator('#expenseScope').selectOption('property');
  await page.getByRole('button', { name: 'Save Expense' }).click();

  await expect(page.locator('#expenseAmountError')).toBeVisible();
  await expect(page.locator('#expensePropertyError')).toBeVisible();
  await expect(page.locator('#expenseDialog')).toHaveAttribute('open', '');
});

test('expense allocation, filtering and CSV export work together', async ({ page }) => {
  await createProperty(page, { title: 'Filter Property', price: '240000' });
  await page.goto('/expenses.html');

  await page.getByRole('button', { name: /Add Expense/i }).click();
  await page.locator('#expenseAmount').fill('99.99');
  await page.locator('#expenseDescription').fill('Property insurance');
  await page.locator('#expenseScope').selectOption('property');
  await page.locator('#expenseProperty').selectOption({ label: 'Filter Property' });
  await page.getByRole('button', { name: 'Save Expense' }).click();

  await page.getByRole('button', { name: 'Filter & Export' }).click();
  await page.locator('#expenseFilter').selectOption({ label: 'Filter Property' });
  await expect(page.locator('#expenseCount')).toHaveText('1');
  await expect(page.getByText('Property insurance')).toBeVisible();
  await expect(page.locator('#propertyExpenses')).toContainText('99.99');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^spv-expenses-\d{4}-\d{2}-\d{2}\.csv$/);

  await page.locator('#expenseFilter').selectOption('company');
  await expect(page.locator('#expenseCount')).toHaveText('0');
  await expect(page.getByRole('heading', { name: 'No expenses recorded' })).toBeVisible();
});

test('receipt PDFs larger than 2 MB are rejected before local save', async ({ page }) => {
  await page.goto('/expenses.html');
  await page.getByRole('button', { name: /Add Expense/i }).click();
  await page.locator('#expenseAmount').fill('25');
  await page.locator('#expenseReceipt').setInputFiles({
    name: 'oversized-receipt.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 1)
  });

  await expect(page.locator('#expenseReceiptSize')).toContainText('oversized-receipt.pdf');
  await page.getByRole('button', { name: 'Save Expense' }).click();
  await expect(page.locator('#expenseReceiptError')).toContainText('2 MB');
  await expect(page.locator('#expenseDialog')).toHaveAttribute('open', '');
  await expect(page.locator('#expenseCount')).toHaveText('0');
});
