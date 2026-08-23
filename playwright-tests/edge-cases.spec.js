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

test('large receipt photos are compressed below 2 MB before being saved', async ({ page }) => {
  await page.goto('/expenses.html');
  await page.getByRole('button', { name: /Add Expense/i }).click();
  await page.locator('#expenseAmount').fill('45');
  await page.locator('#expenseDescription').fill('Large phone receipt');

  const originalSize = await page.locator('#expenseReceipt').evaluate(async (input) => {
    const width = 2200;
    const height = 2200;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    const pixels = context.createImageData(width, height);
    let seed = 123456789;

    for (let index = 0; index < pixels.data.length; index += 4) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      pixels.data[index] = seed & 255;
      pixels.data[index + 1] = (seed >>> 8) & 255;
      pixels.data[index + 2] = (seed >>> 16) & 255;
      pixels.data[index + 3] = 255;
    }

    context.putImageData(pixels, 0, 0);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error('Could not create test receipt')),
        'image/png'
      );
    });
    const file = new File([blob], 'iphone-receipt.png', { type: 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return file.size;
  });

  expect(originalSize).toBeGreaterThan(2 * 1024 * 1024);
  await expect(page.locator('#expenseReceiptSize')).toContainText('will be optimised when saved');
  await page.getByRole('button', { name: 'Save Expense' }).click();
  await expect(page.locator('#expenseDialog')).not.toHaveAttribute('open', '');

  const stored = await page.evaluate(async () => {
    const [expense] = JSON.parse(
      localStorage.getItem('spv-property-calculator.expenses.v1') || '[]'
    );
    const file = await new Promise((resolve, reject) => {
      const request = indexedDB.open('spv-property-calculator.receipts.v1', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('receipts', 'readonly');
        const get = transaction.objectStore('receipts').get(expense.id);
        get.onerror = () => reject(get.error);
        get.onsuccess = () => resolve(get.result?.file || null);
        transaction.oncomplete = () => db.close();
      };
    });
    return {
      metadata: expense.receipt,
      file: file ? { name: file.name, type: file.type, size: file.size } : null
    };
  });

  expect(stored.metadata.name).toMatch(/^large-phone-receipt-\\d{8}-\\d{6}\\.jpg$/);
  expect(stored.metadata.type).toBe('image/jpeg');
  expect(stored.metadata.size).toBeLessThanOrEqual(2 * 1024 * 1024);
  expect(stored.file).toEqual(stored.metadata);
  await expect(page.getByText('Large phone receipt')).toBeVisible();
  await expect(page.getByRole('button', { name: /View receipt/i })).toBeVisible();
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
