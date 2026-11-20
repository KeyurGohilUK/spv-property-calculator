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
        body: `<!doctype html><html lang="en" data-theme="${theme}"><title>Loader test</title><link rel="stylesheet" href="/styles.css"><main><label><input type="checkbox">Continue</label></main></html>`,
      }),
    );
    await page.emulateMedia({
      reducedMotion: theme === 'dark' ? 'reduce' : 'no-preference',
    });
    await page.goto('/loader-test/');
    const checkbox = page.getByRole('checkbox', { name: 'Continue' });
    const bounds = await checkbox.boundingBox();
    await checkbox.focus();
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
    await page.mouse.click(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    await expect(checkbox).not.toBeChecked();
    await page.keyboard.press('Tab');
    await expect(checkbox).not.toBeFocused();
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
    await expect(checkbox).toBeFocused();
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

test('@mobile loader remains visible for one second after immediate completion and has no border', async ({
  page,
}) => {
  await page.route('**/loader-test/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><title>Loader</title><link rel="stylesheet" href="/styles.css"><main>Ready</main></html>',
    }),
  );
  await page.goto('/loader-test/');
  const result = await page.evaluate(async () => {
    const { withBlockingLoader } =
      await import('/src/components/blocking-loader.js');
    let openedAt = 0;
    let closedAt = 0;
    const monitor = new MutationObserver(() => {
      const loader = document.querySelector('.blocking-loader');
      if (loader?.open && !openedAt) openedAt = performance.now();
      if (openedAt && loader && !loader.open && !closedAt)
        closedAt = performance.now();
    });
    monitor.observe(document.body, {
      attributes: true,
      subtree: true,
      childList: true,
    });
    const started = performance.now();
    await withBlockingLoader('Quick operation', async () => 'completed');
    monitor.disconnect();
    const loader = document.querySelector('.blocking-loader');
    const style = getComputedStyle(loader);
    return {
      elapsed: performance.now() - started,
      borderWidth: style.borderTopWidth,
      outlineStyle: style.outlineStyle,
      closed: !loader.open,
    };
  });
  expect(result.elapsed).toBeGreaterThanOrEqual(950);
  expect(result.closed).toBe(true);
  expect(result.borderWidth).toBe('0px');
  expect(result.outlineStyle).toBe('none');
});
