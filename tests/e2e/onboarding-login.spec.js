import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installCloudMock } from './support/cloud-mock.js';

async function freshVisit(page, options = {}) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('onboarding-test-started')) {
      localStorage.removeItem('spv-help-guide-seen');
      sessionStorage.setItem('onboarding-test-started', 'true');
    }
  });
  await page.route(/^https:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await installCloudMock(page, options);
  await page.goto('/');
}

async function login(page) {
  await page.locator('#publicLoginBtn').click();
  await page.locator('#authEmail').fill('approved@example.test');
  await page.locator('#authPassword').fill('test-password');
  await page.locator('#signInBtn').click();
}

for (const theme of ['light', 'dark']) {
  for (const dismiss of ['Finish', 'Close', 'Escape']) {
    test(`@mobile ${theme}: login, policy, tour ${dismiss} leaves a usable workspace`, async ({
      page,
    }) => {
      await page.addInitScript(
        (theme) => localStorage.setItem('spv-theme', theme),
        theme,
      );
      await freshVisit(page, { signedOut: true, policyAccepted: false });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('#publicLoginBtn')).toBeEnabled();
      await expect(page.locator('#app')).toBeHidden();
      await expect(page.locator('#helpGuideDialog')).not.toBeVisible();
      await login(page);
      const policy = page.locator('#policyAcceptanceDialog');
      await expect(policy).toBeVisible();
      await expect(page.locator('dialog[open]')).toHaveCount(1);
      await expect(page.locator('#helpGuideDialog')).not.toBeVisible();
      await policy.locator('#policyAcceptanceCheck').check();
      await policy.getByRole('button', { name: 'Accept and continue' }).click();
      const tour = page.locator('#helpGuideDialog');
      await expect(tour).toBeVisible();
      await expect(page.locator('dialog[open]')).toHaveCount(1);
      if (dismiss === 'Finish') {
        for (let step = 0; step < 3; step++)
          await tour.getByRole('button', { name: 'Next', exact: true }).click();
        await tour.getByRole('button', { name: 'Finish' }).click();
      } else if (dismiss === 'Close') {
        await tour.getByRole('button', { name: 'Close help guide' }).click();
      } else {
        await page.keyboard.press('Escape');
      }
      await expect(tour).not.toBeVisible();
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      await expect(page.locator('#newPropertyBtn')).toBeFocused();
      await page.locator('#newPropertyBtn').click();
      await expect(page.locator('#title')).toBeVisible();
      // Completion must survive a real reload on the same device.
      await expect
        .poll(() =>
          page.evaluate(() => localStorage.getItem('spv-help-guide-seen')),
        )
        .toBe('true');
      await page.locator('#backBtn').click();
      await page.reload();
      await expect(page.locator('#newPropertyBtn')).toBeVisible();
      await expect(tour).not.toBeVisible();
      await page.locator('[data-more-menu]').click();
      await page.getByRole('button', { name: /Help Guide/ }).click();
      await expect(tour).toBeVisible();
      await expect(page.locator('dialog[open]')).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-more-menu]')).toBeFocused();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
  }
}

for (const options of [
  { unapproved: true },
  { inactive: true },
  { workspaceRole: 'pending' },
]) {
  test(`@mobile denied membership ${JSON.stringify(options)} never opens workspace or tour`, async ({
    page,
  }) => {
    await freshVisit(page, { ...options, signedOut: true });
    await login(page);
    await expect(page.locator('#authMessage')).toContainText(
      'active, approved account',
    );
    await expect(page.locator('#app')).toBeHidden();
    await expect(page.locator('#helpGuideDialog')).not.toBeVisible();
    await page.reload();
    await expect(page.locator('#publicLoginBtn')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
  });
}

test('@mobile access help is keyboard accessible and has no invented recovery links', async ({
  page,
}) => {
  await freshVisit(page, { signedOut: true });
  await page.locator('#publicLoginBtn').click();
  await expect(
    page.getByRole('heading', { name: 'Sign in to your workspace' }),
  ).toBeVisible();
  const help = page.locator('.auth-help summary');
  await help.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.auth-help')).toContainText(
    'Contact your workspace administrator',
  );
  await expect(page.locator('.auth-help a')).toHaveCount(0);
  const results = await new AxeBuilder({ page })
    .include('#authDialog')
    .analyze();
  expect(results.violations).toEqual([]);
});

test('@mobile returning approved session respects completion and works offline', async ({
  page,
}) => {
  await page.route(/^https:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await installCloudMock(page);
  await page.goto('/');
  await expect(page.locator('#newPropertyBtn')).toBeVisible();
  await expect(page.locator('#helpGuideDialog')).not.toBeVisible();
  await page.reload();
  await expect(page.locator('#newPropertyBtn')).toBeVisible();
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.locator('#newPropertyBtn').click();
  await page.locator('#title').fill('Offline local property');
  await page.locator('#purchasePrice').fill('200000');
  await page.locator('#savePropertyBtn').click();
  await expect(page.locator('#saveMessage')).toContainText(
    /Saved (?:on this device|locally)/,
  );
});

test('@mobile policy sign out from login restores usable public landing', async ({
  page,
}) => {
  await freshVisit(page, { signedOut: true, policyAccepted: false });
  await login(page);
  const policy = page.locator('#policyAcceptanceDialog');
  await expect(policy).toBeVisible();
  await policy.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.locator('#publicLoginBtn')).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('#app')).toBeHidden();
  await login(page);
  await expect(policy).toBeVisible();
  await expect(
    policy.getByRole('button', { name: 'Sign out', exact: true }),
  ).toBeEnabled();
});

test('@mobile storage write failure still allows tour dismissal', async ({
  page,
}) => {
  await freshVisit(page);
  await expect(page.locator('#helpGuideDialog')).toBeVisible();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Storage unavailable');
    };
  });
  await page.locator('[data-help-close]').click();
  await expect(page.locator('#helpGuideDialog')).not.toBeVisible();
  await expect(page.locator('#newPropertyBtn')).toBeFocused();
  await page.locator('#newPropertyBtn').click();
  await expect(page.locator('#title')).toBeVisible();
});
