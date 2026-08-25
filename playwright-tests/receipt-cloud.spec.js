import { test, expect } from '@playwright/test';
import { installCloudMock } from './support/cloud-mock.js';
import { installReceiptWorkerMock } from './support/receipt-worker-mock.js';

const EXPENSE_KEY = 'spv-property-calculator.expenses.v1';
const FIXED_TIME = '2026-08-23T10:00:00.000Z';

function smallPdf(name = 'receipt.pdf') {
  return {
    name,
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 Playwright mocked receipt')
  };
}

async function openNewExpense(page, amount = '42.50') {
  await page.getByRole('button', { name: /Add Expense/i }).click();
  await page.locator('#expenseAmount').fill(amount);
}

async function storedExpense(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]')[0] || null, EXPENSE_KEY);
}

test.beforeEach(async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'Receipt cloud orchestration is browser-independent');
});

test('uploads, replaces and deletes a receipt through the private Worker contract', async ({ page }) => {
  await installCloudMock(page);
  const worker = await installReceiptWorkerMock(page, {
    objectPath: 'receipts/expense-playwright/current-receipt.pdf'
  });
  await page.goto('/expenses.html');
  await expect(page.locator('#secondaryAccountBtn')).toHaveClass(/is-signed-in/);

  await openNewExpense(page);
  await page.locator('#expenseDescription').fill('Receipt lifecycle');
  await page.locator('#expenseReceipt').setInputFiles(smallPdf('first-receipt.pdf'));
  await page.getByRole('button', { name: 'Save Expense' }).click();

  await expect.poll(() => worker.callsFor('PUT').length).toBe(1);
  const firstUpload = worker.callsFor('PUT')[0];
  expect(firstUpload.headers.authorization).toBe('Bearer playwright-access-token');
  expect(firstUpload.headers['x-receipt-name']).toMatch(/^receipt-lifecycle-\d{8}-\d{6}\.pdf$/);
  expect(firstUpload.body.length).toBeGreaterThan(0);

  await expect.poll(async () => (await storedExpense(page))?.receiptCloudPending).toBe(false);
  const uploadedExpense = await storedExpense(page);
  expect(uploadedExpense.receiptObjectPath).toBe('receipts/expense-playwright/current-receipt.pdf');

  await page.locator('.expense-card-main').click();
  await page.locator('#expenseReceipt').setInputFiles(smallPdf('replacement-receipt.pdf'));
  await page.getByRole('button', { name: 'Save Changes' }).click();

  await expect.poll(() => worker.callsFor('PUT').length).toBe(2);
  const replacement = worker.callsFor('PUT')[1];
  expect(replacement.headers['x-previous-object-key']).toBe('receipts/expense-playwright/current-receipt.pdf');
  expect(replacement.headers['x-receipt-name']).toMatch(/^receipt-lifecycle-\d{8}-\d{6}\.pdf$/);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /Delete expense/i }).click();
  await expect.poll(() => worker.callsFor('DELETE').length).toBe(1);
  expect(worker.callsFor('DELETE')[0].url).toContain(
    encodeURIComponent('receipts/expense-playwright/current-receipt.pdf')
  );
  await expect(page.locator('#expenseCount')).toHaveText('0');
});

test('downloads a cloud receipt when this device has no cached file', async ({ page }) => {
  await installCloudMock(page, {
    expenses: [{
      id: 'expense-cloud-receipt',
      amount: 88,
      expense_date: '2026-08-20',
      category: 'Legal & professional',
      scope: 'company',
      property_id: null,
      description: 'Remote receipt',
      notes: '',
      receipt_metadata: {
        name: 'remote-receipt.pdf',
        type: 'application/pdf',
        size: 30
      },
      receipt_object_path: 'receipts/expense-cloud-receipt/remote-receipt.pdf',
      created_at: FIXED_TIME,
      updated_at: FIXED_TIME,
      deleted_at: null,
      revision: 1
    }]
  });
  const worker = await installReceiptWorkerMock(page);
  await page.goto('/expenses.html');
  await expect(page.getByText('Remote receipt')).toBeVisible();

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: /View receipt/i }).click();
  const popup = await popupPromise;

  await expect.poll(() => worker.callsFor('GET').length).toBe(1);
  expect(worker.callsFor('GET')[0].headers.authorization).toBe('Bearer playwright-access-token');
  const cached = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('spv-property-calculator.receipts.v1', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('receipts', 'readonly');
      const get = transaction.objectStore('receipts').get('expense-cloud-receipt');
      get.onerror = () => reject(get.error);
      get.onsuccess = () => resolve({
        objectPath: get.result?.objectPath || '',
        fileSize: get.result?.file?.size || 0
      });
      transaction.oncomplete = () => db.close();
    };
  }));
  expect(cached.objectPath).toBe('receipts/expense-cloud-receipt/remote-receipt.pdf');
  expect(cached.fileSize).toBeGreaterThan(0);
  await popup.close();
});

test('pending offline receipt uploads after reconnecting and shared sync', async ({ page, context }) => {
  await installCloudMock(page);
  const worker = await installReceiptWorkerMock(page);
  await page.goto('/expenses.html');
  await expect(page.locator('#secondaryAccountBtn')).toHaveClass(/is-signed-in/);

  await context.setOffline(true);
  await openNewExpense(page, '31');
  await page.locator('#expenseReceipt').setInputFiles(smallPdf('offline-receipt.pdf'));
  await page.getByRole('button', { name: 'Save Expense' }).click();

  expect(worker.callsFor('PUT')).toHaveLength(0);
  expect((await storedExpense(page)).receiptCloudPending).toBe(true);
  await expect(page.locator('#expenseSyncStatus')).toContainText('Offline');

  await context.setOffline(false);
  await expect.poll(() => worker.callsFor('PUT').length).toBeGreaterThan(0);
  await expect.poll(async () => (await storedExpense(page))?.receiptCloudPending).toBe(false);
  const uploadsAfterReconnect = worker.callsFor('PUT').length;

  await page.locator('#secondaryAccountBtn').click();
  await page.locator('#secondarySyncBtn').click();
  await expect(page.locator('#secondaryAccountMessage')).toHaveText('Cloud is up to date.');
  expect(worker.callsFor('PUT')).toHaveLength(uploadsAfterReconnect);
});

test('unauthorized Worker response keeps the receipt safely pending locally', async ({ page }) => {
  await installCloudMock(page);
  const worker = await installReceiptWorkerMock(page, { uploadStatus: 401 });
  await page.goto('/expenses.html');
  await expect(page.locator('#secondaryAccountBtn')).toHaveClass(/is-signed-in/);

  await openNewExpense(page, '19');
  await page.locator('#expenseDescription').fill('Protected receipt');
  await page.locator('#expenseReceipt').setInputFiles(smallPdf('protected-receipt.pdf'));
  await page.getByRole('button', { name: 'Save Expense' }).click();

  await expect.poll(() => worker.callsFor('PUT').length).toBeGreaterThan(0);
  const expense = await storedExpense(page);
  expect(expense.receipt.name).toMatch(/^protected-receipt-\d{8}-\d{6}\.pdf$/);
  expect(expense.receiptCloudPending).toBe(true);
  expect(expense.receiptObjectPath).toBe('');
  await expect(page.locator('#expenseSyncStatus')).toContainText(/pending|failed/i);
});
