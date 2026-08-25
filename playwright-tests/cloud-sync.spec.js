import { test, expect } from '@playwright/test';
import { installCloudMock, cloudCalls } from './support/cloud-mock.js';

const PROPERTY_KEY = 'spv-property-calculator.properties.v1';
const EXPENSE_KEY = 'spv-property-calculator.expenses.v1';
const FIXED_TIME = '2026-08-23T10:00:00.000Z';

async function seedLocalWorkspace(page, { properties = [], expenses = [] } = {}) {
  await page.addInitScript(({ propertyKey, expenseKey, properties: propertyData, expenses: expenseData }) => {
    localStorage.setItem(propertyKey, JSON.stringify(propertyData));
    localStorage.setItem(expenseKey, JSON.stringify(expenseData));
  }, {
    propertyKey: PROPERTY_KEY,
    expenseKey: EXPENSE_KEY,
    properties,
    expenses
  });
}

function pendingProperty(overrides = {}) {
  return {
    id: 'property-playwright-1',
    title: 'Pending Cloud Property',
    purchasePrice: 250000,
    depositPercent: 25,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    _cloudRevision: 0,
    _cloudDirty: true,
    ...overrides
  };
}

function pendingExpense(overrides = {}) {
  return {
    id: 'expense-playwright-1',
    amount: 45,
    date: '2026-08-23',
    category: 'Office & administration',
    scope: 'company',
    propertyId: '',
    description: 'Pending cloud expense',
    notes: '',
    receipt: null,
    receiptObjectPath: '',
    receiptCloudPending: false,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    deletedAt: null,
    _cloudRevision: 0,
    _cloudDirty: true,
    ...overrides
  };
}

test.beforeEach(async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'Cloud orchestration is browser-independent');
});

test('one workspace sync uploads pending properties and expenses', async ({ page }) => {
  await installCloudMock(page);
  await seedLocalWorkspace(page, {
    properties: [pendingProperty()],
    expenses: [pendingExpense()]
  });

  await page.goto('/');
  await expect(page.locator('#accountBtn')).toHaveClass(/is-signed-in/);

  await expect.poll(async () => {
    const calls = await cloudCalls(page);
    return calls.filter((call) => call.type === 'rpc').map((call) => call.name).sort();
  }).toEqual(['upsert_expense_if_current', 'upsert_property_if_current']);

  await page.locator('#accountBtn').click();
  await page.locator('#dialogSyncBtn').click();
  await expect(page.locator('#accountSyncText')).toHaveText('Cloud is up to date.');

  const localState = await page.evaluate(({ propertyKey, expenseKey }) => ({
    properties: JSON.parse(localStorage.getItem(propertyKey) || '[]'),
    expenses: JSON.parse(localStorage.getItem(expenseKey) || '[]')
  }), { propertyKey: PROPERTY_KEY, expenseKey: EXPENSE_KEY });
  expect(localState.properties[0]._cloudDirty).toBe(false);
  expect(localState.expenses[0]._cloudDirty).toBe(false);
  expect(localState.properties[0]._cloudRevision).toBe(1);
  expect(localState.expenses[0]._cloudRevision).toBe(1);
});

test('property download failure is reported with the real safe error message', async ({ page }) => {
  await installCloudMock(page, { propertyListError: 'Mocked property download failure' });
  await page.goto('/');
  await expect(page.locator('#accountBtn')).toHaveClass(/is-signed-in/);

  await page.locator('#accountBtn').click();
  await expect(page.locator('#accountSyncText')).toContainText('Sync pending: Mocked property download failure');

  await page.locator('#dialogSyncBtn').click();
  await expect(page.locator('#signedInMessage')).toContainText('Sync pending: Mocked property download failure');
});

test('expense conflict preserves the dirty local record and explains the conflict', async ({ page }) => {
  await installCloudMock(page, {
    expenses: [{
      id: 'expense-playwright-1',
      amount: 40,
      expense_date: '2026-08-23',
      category: 'Office & administration',
      scope: 'company',
      property_id: null,
      description: 'Remote expense',
      notes: '',
      receipt_metadata: null,
      receipt_object_path: null,
      created_at: FIXED_TIME,
      updated_at: FIXED_TIME,
      deleted_at: null,
      revision: 1
    }]
  });
  await seedLocalWorkspace(page, {
    expenses: [pendingExpense({ _cloudRevision: 0, amount: 45 })]
  });

  await page.goto('/');
  await expect(page.locator('#accountBtn')).toHaveClass(/is-signed-in/);
  await page.locator('#accountBtn').click();
  await expect(page.locator('#accountSyncText')).toContainText('1 sync conflict');

  const localExpense = await page.evaluate((key) => {
    return JSON.parse(localStorage.getItem(key) || '[]')[0];
  }, EXPENSE_KEY);
  expect(localExpense.amount).toBe(45);
  expect(localExpense._cloudDirty).toBe(true);
});

test('offline account state disables manual sync and retains local changes', async ({ page, context }) => {
  await installCloudMock(page);
  await page.goto('/');
  await expect(page.locator('#accountBtn')).toHaveClass(/is-signed-in/);

  await context.setOffline(true);
  await page.locator('#accountBtn').click();
  await expect(page.locator('#dialogSyncBtn')).toBeDisabled();
  await expect(page.locator('#accountSyncText')).toContainText('Offline now');
  await expect(page.locator('#propertySyncStatus')).toContainText('Offline');
});

test('secondary-page automatic and manual sync share one expense operation', async ({ page }) => {
  await installCloudMock(page);
  await seedLocalWorkspace(page, { expenses: [pendingExpense()] });

  await page.goto('/expenses/');
  await expect(page.locator('#accountBtn')).toHaveClass(/is-signed-in/);
  await expect(page.locator('#expenseSyncStatus')).toContainText('Synced');

  await expect.poll(async () => {
    const calls = await cloudCalls(page);
    return calls.filter((call) => call.name === 'upsert_expense_if_current').length;
  }).toBe(1);

  await page.locator('#accountBtn').click();
  await page.locator('#secondarySyncBtn').click();
  await expect(page.locator('#secondaryAccountMessage')).toHaveText('Cloud is up to date.');

  const calls = await cloudCalls(page);
  expect(calls.filter((call) => call.name === 'upsert_expense_if_current')).toHaveLength(1);
});
