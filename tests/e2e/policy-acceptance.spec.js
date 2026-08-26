import { test, expect } from '@playwright/test';
import { blockExternalServices } from './support/app-helpers.js';
import { cloudCalls } from './support/cloud-mock.js';

test('authenticated users accept the current legal policies once before entering the workspace', async ({ page }) => {
  await blockExternalServices(page, { policyAccepted: false });
  await page.goto('/');

  const dialog = page.locator('#policyAcceptanceDialog');
  await expect(dialog).toHaveAttribute('open', '');
  await expect(page.locator('#app')).toBeHidden();
  await expect(dialog.getByRole('link', { name: 'Terms of Use' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Privacy Policy' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Planning Disclaimer' })).toBeVisible();

  const accept = dialog.getByRole('button', { name: 'Accept and continue' });
  await expect(accept).toBeDisabled();
  await dialog.locator('#policyAcceptanceCheck').check();
  await accept.click();

  await expect(dialog).not.toHaveAttribute('open', '');
  await expect(page.locator('#app')).toBeVisible();
  await expect.poll(async () => (await cloudCalls(page)).find((call) => call.type === 'upsert' && call.table === 'policy_acceptances')).toBeTruthy();
});
