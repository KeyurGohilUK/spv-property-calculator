import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installCloudMock } from './support/cloud-mock.js';

for (const theme of ['light', 'dark']) {
  test(`@mobile ${theme}: loader blocks input and waits for every operation`, async ({
    page,
  }) => {
    await page.route('**/loader-test/', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html lang="en" data-theme="${theme}"><title>Loader test</title><link rel="stylesheet" href="/styles.css"><main><button type="button">Continue</button></main></html>`,
      }),
    );
    await page.emulateMedia({
      reducedMotion: theme === 'dark' ? 'reduce' : 'no-preference',
    });
    await page.goto('/loader-test/');
    const button = page.getByRole('button', { name: 'Continue' });
    await button.focus();
    await page.evaluate(async () => {
      const { withBlockingLoader } =
        await import('/src/components/blocking-loader.js');
      const start = (message) => {
        const { promise, resolve, reject } = Promise.withResolvers();
        withBlockingLoader(message, () => promise).catch(() => {});
        return { resolve, reject };
      };
      window.loaderTest = {
        first: start('Loading your workspace…'),
        second: start('Checking workspace access…'),
      };
    });
    const loader = page.getByRole('dialog', {
      name: 'Checking workspace access…',
    });
    await expect(loader).toBeVisible();
    await expect(button).toHaveCount(0);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await expect(loader).toBeVisible();
    await expect
      .poll(() => loader.locator('img').evaluate((image) => image.currentSrc))
      .toMatch(theme === 'dark' ? /icon-192\.png$/ : /spv-loading\.gif$/);
    expect(
      (await new AxeBuilder({ page }).include('.blocking-loader').analyze())
        .violations,
    ).toEqual([]);
    await page.evaluate(() =>
      window.loaderTest.second.reject(new Error('Failed')),
    );
    await expect(
      page.getByRole('dialog', { name: 'Loading your workspace…' }),
    ).toBeVisible();
    await page.evaluate(() => window.loaderTest.first.resolve());
    await expect(page.locator('.blocking-loader')).toBeHidden();
    await expect(button).toBeFocused();
  });
}

test('@mobile startup blocks until the cloud client is ready', async ({
  page,
}) => {
  await installCloudMock(page, { signedOut: true });
  await page.route('**/cloud.js', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      'async function init() {',
      "async function init() { await new Promise(resolve => window.addEventListener('spv-test-resume', resolve, { once: true }));",
    );
    await route.fulfill({ response, body });
  });
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('dialog', { name: 'Starting the app…' }),
    ).toBeVisible();
  } finally {
    await page.evaluate(() =>
      window.dispatchEvent(new Event('spv-test-resume')),
    );
  }
  await expect(page.locator('.blocking-loader')).toBeHidden();
  await expect(page.locator('#publicLoginBtn')).toBeEnabled();
});
