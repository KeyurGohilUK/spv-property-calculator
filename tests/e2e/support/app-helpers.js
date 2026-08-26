import { expect } from '@playwright/test';
import { installCloudMock } from './cloud-mock.js';

export async function blockExternalServices(page, { authenticated = true } = {}) {
  await page.addInitScript(() => localStorage.setItem('spv-help-guide-seen', 'true'));
  await page.route(/^https:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await installCloudMock(page, { signedOut: !authenticated });
}

export async function openContainingSection(page, fieldSelector) {
  const details = page.locator(fieldSelector).locator('xpath=ancestor::details[1]');
  if (!(await details.getAttribute('open'))) {
    await details.locator(':scope > summary').click();
  }
}

export async function createProperty(page, {
  title = 'Playwright Test Property',
  price = '250000',
  refurbishment = '0'
} = {}) {
  await page.goto('/');
  await page.locator('#newPropertyBtn').click();
  await page.locator('#title').fill(title);
  await page.locator('#purchasePrice').fill(price);

  if (refurbishment !== '0') {
    await openContainingSection(page, '#refurbishmentCost');
    await page.locator('#refurbishmentCost').fill(refurbishment);
  }

  await page.locator('#savePropertyBtn').click();
  await expect(page.locator('#saveMessage')).toContainText(/Saved (?:on this device|locally and synced to Supabase)/);
  await page.locator('#backBtn').click();
  await expect(page.locator('#homeView')).not.toHaveClass(/hidden/);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}
