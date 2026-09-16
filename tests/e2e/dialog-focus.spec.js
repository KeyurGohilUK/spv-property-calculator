import { test, expect } from '@playwright/test';
import { blockExternalServices } from './support/app-helpers.js';

test.beforeEach(async ({ page }) => {
  await blockExternalServices(page);
});

test('App Menu has no duplicate BRRR item and opens without selecting Close', async ({ page }) => {
  await page.goto('/');
  await page.locator('#moreNavBtn').click();

  const dialog = page.locator('#moreMenuDialog');
  await expect(dialog).toHaveAttribute('open', '');
  await expect(page.getByText('BRRR Calculator', { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('moreMenuDialog');
  await expect(page.locator('#closeMoreMenuDialog')).not.toBeFocused();
});

test('shared Install dialog opens with neutral container focus', async ({ page }) => {
  await page.goto('/');
  await page.locator('#installBtn').click();

  const dialog = page.locator('#installDialog');
  await expect(dialog).toHaveAttribute('open', '');
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('installDialog');
  await expect(page.locator('#closeInstallDialog')).not.toBeFocused();
});
