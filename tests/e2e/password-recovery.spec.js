import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { cloudCalls, installCloudMock } from './support/cloud-mock.js';

test.beforeEach(async ({ page }) => {
  await installCloudMock(page, { signedOut: true });
});

for (const theme of ['light', 'dark']) {
  test(`@mobile ${theme}: signed-out user can request a reset email`, async ({
    page,
  }) => {
    await page.addInitScript(
      (theme) => localStorage.setItem('spv-theme', theme),
      theme,
    );
    await page.goto('/');
    await page.locator('#publicLoginBtn').click();
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page
      .getByRole('textbox', { name: 'Email address' })
      .fill('existing@example.test');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toContainText(
      'If an account exists',
    );
    expect(await cloudCalls(page)).toContainEqual({
      type: 'reset-email',
      email: 'existing@example.test',
      options: {
        redirectTo: 'http://127.0.0.1:4173/reset-password/?recovery=1',
      },
    });
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
}

test('@mobile recovery session updates the password without opening the workspace', async ({
  page,
}) => {
  await page.goto(
    '/reset-password/?recovery=1#type=recovery&access_token=test-access&refresh_token=test-refresh',
  );
  await expect(
    page.getByRole('heading', { name: 'Choose a new password' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password\/\?recovery=1$/);
  expect(await cloudCalls(page)).toContainEqual({
    type: 'recovery-client',
    config: {
      storageKey: 'spv-password-recovery',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: 'implicit',
    },
  });
  await page
    .getByLabel('New password', { exact: true })
    .fill('new-test-password');
  const confirmation = page.getByLabel('Confirm new password');
  await confirmation.fill('different-password');
  const save = page.getByRole('button', { name: 'Save new password' });
  await save.click();
  await expect(page.getByRole('status')).toHaveText(
    'The passwords do not match.',
  );
  expect(await cloudCalls(page)).not.toContainEqual(
    expect.objectContaining({ type: 'reset-password' }),
  );
  await confirmation.fill('new-test-password');
  await save.click();
  await expect(page.getByRole('status')).toContainText('Password updated');
  expect(await cloudCalls(page)).toContainEqual({
    type: 'reset-password',
    password: 'new-test-password',
  });
  await page.getByRole('link', { name: 'Back to sign in' }).click();
  await expect(page.locator('#publicLoginBtn')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
});

test('@mobile expired recovery link allows a fresh request', async ({
  page,
}) => {
  await page.goto('/reset-password/?recovery=1#error_code=otp_expired');
  await expect(page.getByRole('status')).toContainText('invalid or expired');
  await expect(
    page.getByRole('button', { name: 'Send reset link' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save new password' }),
  ).toBeHidden();
  await expect(page).toHaveURL(/\/reset-password\/\?recovery=1$/);
});
