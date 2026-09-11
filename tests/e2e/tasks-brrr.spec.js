import { test, expect } from '@playwright/test';
import { blockExternalServices } from './support/app-helpers.js';

test.beforeEach(async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Core feature flow is browser-independent; shared mobile coverage runs separately.');
  await blockExternalServices(page);
});

test('task manager creates a company task and keeps it visible', async ({ page }) => {
  await page.goto('/tasks/');
  await expect(page.getByRole('heading', { name: /Task Manager/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Add Task/i })).toBeEnabled();

  await page.getByRole('button', { name: /Add Task/i }).click();
  await page.locator('#taskTitle').fill('Review mortgage offer');
  await page.locator('#taskDescription').fill('Check https://example.com/mortgage-guide before the call.');
  await page.getByRole('button', { name: 'Save Task' }).click();

  const card = page.locator('.task-card').filter({ hasText: 'Review mortgage offer' });
  await expect(card).toBeVisible();
  await expect(card.locator('.task-card-description .inline-text-link')).toHaveAttribute('href', 'https://example.com/mortgage-guide');
  await expect(page.locator('#taskCount')).toHaveText('1');
});

test('task discussion reuses the compact shared chat flow', async ({ page }) => {
  await page.goto('/tasks/');
  await page.getByRole('button', { name: /Add Task/i }).click();
  await page.locator('#taskTitle').fill('Discuss mortgage limit');
  await page.getByRole('button', { name: 'Save Task' }).click();

  await page.getByRole('button', { name: 'Edit task: Discuss mortgage limit' }).click();
  await expect(page.getByRole('heading', { name: 'Discussion' })).toBeVisible();
  await expect(page.locator('#taskCommentList')).toHaveClass(/chat-list/);

  await page.locator('#taskComment').fill('Need an Agreement in Principle first: https://example.com/aip');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('#taskCommentList .chat-bubble')).toContainText('Need an Agreement in Principle first:');
  await expect(page.locator('#taskCommentList .chat-bubble .inline-text-link')).toHaveAttribute('href', 'https://example.com/aip');

  await page.getByRole('button', { name: 'Edit your message' }).click();
  await expect(page.locator('#taskComment')).toHaveValue('Need an Agreement in Principle first: https://example.com/aip');
  await expect(page.getByRole('button', { name: 'Save edited message' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Changes' })).toHaveCount(1);
});

test('BRRR calculator renders scenarios and reacts to an offer-range change', async ({ page }) => {
  await page.goto('/brrr/');
  await expect(page.getByRole('heading', { name: /BRRR Calculator/i })).toBeVisible();
  await expect(page.locator('#brrrRows tr').first()).toBeVisible();

  await page.locator('#brrrMinOffer').fill('140000');
  await page.locator('#brrrMaxOffer').fill('150000');
  await page.locator('#brrrOfferStep').fill('5000');
  await page.locator('#brrrOfferStep').dispatchEvent('change');

  await expect(page.locator('#brrrRows tr')).toHaveCount(3);
  await expect(page.locator('#brrrBreakevenPrice')).toContainText('Max to fully recycle');
});
