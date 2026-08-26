import { test, expect } from '@playwright/test';
import { blockExternalServices } from './support/app-helpers.js';

test.beforeEach(async ({ page }) => {
  await blockExternalServices(page, { authenticated: false });
});

test('anonymous visitors see only the private landing page and login', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'SPV Property Calculator' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
  await expect(page.locator('#installBtn')).toBeHidden();
  await expect(page.locator('#connectionStatus')).toBeHidden();
  await expect(page.locator('.primary-app-nav')).toBeHidden();

  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.locator('#authDialog')).toHaveAttribute('open', '');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account' })).toHaveCount(0);
});

for (const route of ['/expenses/', '/forecast/', '/admin/users/']) {
  test(`anonymous visitors cannot open ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
  });
}
