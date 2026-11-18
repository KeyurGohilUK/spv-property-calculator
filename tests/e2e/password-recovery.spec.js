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
    await page.locator('#authEmail').fill('existing@example.test');
    const recoveryLink = page.getByRole('link', { name: 'Forgot password?' });
    await expect(recoveryLink).toHaveCSS('font-size', '16px');
    await recoveryLink.click();
    await expect(page).toHaveURL(/\/reset-password\/$/);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(
      page.getByRole('textbox', { name: 'Email address' }),
    ).toHaveValue('existing@example.test');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toHaveAttribute(
      'data-state',
      'success',
    );
    await expect(page.getByRole('status').locator('strong')).toHaveText(
      'Check your inbox and spam folder',
    );
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
  const password = page.getByLabel('New password', { exact: true });
  const save = page.getByRole('button', { name: 'Save new password' });
  await save.click();
  await expect(password).toHaveAccessibleDescription('Enter a new password.');
  await expect(password).toBeFocused();
  await password.fill('short');
  await save.click();
  await expect(password).toHaveAccessibleDescription(
    'Use at least 6 characters.',
  );
  await password.fill('new-test-password');
  await page
    .getByRole('button', { name: 'Show new password', exact: true })
    .click();
  await expect(password).toHaveAttribute('type', 'text');
  const confirmation = page.getByLabel('Confirm new password', { exact: true });
  await confirmation.fill('different-password');
  await page.getByRole('button', { name: 'Show confirm new password' }).click();
  await expect(confirmation).toHaveAttribute('type', 'text');
  expect(
    await save.evaluate((button) => {
      const range = document.createRange();
      range.selectNodeContents(button);
      return range.getClientRects().length;
    }),
  ).toBe(1);
  await save.click();
  await expect(password).toHaveAttribute('type', 'password');
  await expect(confirmation).toHaveAttribute('type', 'password');
  await expect(confirmation).toHaveAccessibleDescription(
    'The passwords do not match.',
  );
  await expect(confirmation).toBeFocused();
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

test('@mobile sign-in password visibility expires and resets when the dialog closes', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  const login = page.locator('#publicLoginBtn');
  await login.click();
  const password = page.locator('#authPassword');
  await password.fill('test-password');
  const reveal = page.getByRole('button', { name: 'Show password' });
  await expect(password).toHaveAttribute('type', 'password');
  await page.clock.runFor(50);
  await reveal.focus();
  await page.keyboard.press('Space');
  await expect(password).toHaveAttribute('type', 'text');
  await expect(reveal).toHaveAttribute('aria-pressed', 'true');
  await reveal.click();
  await expect(password).toHaveAttribute('type', 'password');
  await reveal.click();
  await page.clock.fastForward(15001);
  await expect(password).toHaveAttribute('type', 'password');
  await reveal.click();
  await page.locator('#closeAuthDialog').click();
  await login.click();
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveValue('test-password');
});

test('@mobile sign-in and reset requests validate required fields and email format', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#publicLoginBtn').click();
  const email = page.locator('#authEmail');
  const password = page.locator('#authPassword');
  await page.locator('#signInBtn').click();
  await expect(email).toHaveAccessibleDescription('Enter your email address.');
  await expect(email).toBeFocused();
  await expect(password).toHaveAccessibleDescription('Enter your password.');
  await email.fill('invalid');
  await email.press('Enter');
  await expect(email).toHaveAccessibleDescription(
    'Enter a valid email address.',
  );
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  const resetEmail = page.getByRole('textbox', { name: 'Email address' });
  const send = page.getByRole('button', { name: 'Send reset link' });
  await send.click();
  await expect(resetEmail).toHaveAccessibleDescription(
    'Enter a valid email address.',
  );
  await resetEmail.clear();
  await send.click();
  await expect(resetEmail).toHaveAccessibleDescription(
    'Enter your email address.',
  );
  await expect(resetEmail).toBeFocused();
  expect(await cloudCalls(page)).toEqual([]);
});
