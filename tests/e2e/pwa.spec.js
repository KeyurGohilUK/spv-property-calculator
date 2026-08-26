import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { blockExternalServices, createProperty } from './support/app-helpers.js';

const APP_CACHE_PREFIX = 'spv-property-calculator-';
const CURRENT_VERSION = JSON.parse(fs.readFileSync(new URL('../../release.json', import.meta.url), 'utf8')).version;

async function waitForServiceWorkerControl(page) {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);

  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload();
  }

  await expect.poll(
    () => page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    { message: 'the page should be controlled by the service worker' }
  ).toBe(true);
}

async function mockRelease(page, version, notes = []) {
  const installMock = ({ releaseVersion, releaseNotes }) => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : input.url,
        document.baseURI
      );
      if (url.pathname.endsWith('/release.json')) {
        return Promise.resolve(new Response(JSON.stringify({
          version: releaseVersion,
          notes: releaseNotes
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
      return nativeFetch(input, init);
    };
  };
  const release = { releaseVersion: version, releaseNotes: notes };

  await page.addInitScript(installMock, release);
  if (page.url() !== 'about:blank') {
    await page.evaluate(installMock, release);
  }
}

async function failAppAsset(page, assetName) {
  await page.evaluate((failedAsset) => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : input.url,
        document.baseURI
      );
      if (url.pathname.endsWith(`/${failedAsset}`)) {
        return Promise.resolve(new Response('Temporarily unavailable', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' }
        }));
      }
      return nativeFetch(input, init);
    };
  }, assetName);
}

async function openInstallDialog(page) {
  await page.locator('#installBtn').click();
  await expect(page.locator('#installDialog')).toHaveAttribute('open', '');
}

test.beforeEach(async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Service-worker automation is covered in Chromium');
  await blockExternalServices(page);
});

test('installs the app shell and controls the page', async ({ page }) => {
  await waitForServiceWorkerControl(page);

  const cacheState = await page.evaluate(async ({ prefix }) => {
    const names = await caches.keys();
    const appCacheName = names.find((name) => name.startsWith(prefix));
    const requests = appCacheName
      ? await (await caches.open(appCacheName)).keys()
      : [];

    return {
      appCacheName,
      urls: requests.map((request) => new URL(request.url).pathname)
    };
  }, { prefix: APP_CACHE_PREFIX });

  expect(cacheState.appCacheName).toBeTruthy();
  expect(cacheState.urls).toEqual(expect.arrayContaining([
    '/',
    '/index.html',
    '/expenses/',
    '/src/app/app.js',
    '/styles.css'
  ]));
});

test('opens the cached expense tracker while offline', async ({ page, context }) => {
  await waitForServiceWorkerControl(page);
  await page.goto('/expenses/');
  await expect(page.getByRole('heading', { name: 'Expense Tracker' })).toBeVisible();

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Expense Tracker' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Add Expense/i })).toBeVisible();
});

test('loads canonical modules from the organised folders', async ({ page }) => {
  await page.goto('/');

  const canonicalModules = await page.evaluate(async () => Promise.all([
    import('/src/utils/format-utils.js').then((module) => typeof module.formatCurrency),
    import('/src/utils/validation.js').then((module) => typeof module.setFieldValidation),
    import('/src/features/properties/calendar-invite.js').then((module) => typeof module.buildViewingCalendarInvite),
    import('/src/app/primary-navigation.js').then((module) => typeof module.setupPrimaryNavigation),
    import('/src/app/app-shell.js').then((module) => typeof module.setupAppShell),
    import('/src/components/install-component.js').then((module) => typeof module.setupInstallComponent),
    import('/src/components/update-notifier.js').then((module) => typeof module.setupUpdateNotifier),
    import('/src/services/push-subscription.js').then((module) => typeof module.createPushSubscriptionService),
    import('/src/components/notification-settings.js').then((module) => typeof module.setupNotificationSettings)
  ]));

  expect(canonicalModules).toEqual([
    'function', 'function', 'function', 'function', 'function',
    'function', 'function', 'function', 'function'
  ]);
});

test('shows the shared per-device note notification setting', async ({ page }) => {
  await page.goto('/');
  await page.locator('#moreNavBtn').click();

  const toggle = page.locator('[data-notification-toggle]');
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeDisabled();
  await expect(toggle.locator('[data-notification-description]')).toHaveText(
    'Notification server setup is required.'
  );
});

test('shows a newer release and its notes in the install dialog', async ({ page }) => {
  await mockRelease(page, '9.9.9', ['Improved offline updates']);
  await page.goto('/');
  await expect(page.locator('#installBtn')).toHaveClass(/update-available/);
  await expect(page.locator('#installBtn')).toHaveAttribute('aria-label', 'Update 9.9.9 available');
  await openInstallDialog(page);

  await expect(page.locator('#releaseVersion')).toHaveText('Version 9.9.9');
  await expect(page.locator('#releaseNotes')).toContainText('Improved offline updates');
  await expect(page.locator('#downloadUpdatesBtn')).toContainText('Download updates');
  await expect(page.locator('#releaseStatus')).toContainText(`Installed ${CURRENT_VERSION}`);
});

test('reports when the installed release is current', async ({ page }) => {
  await mockRelease(page, CURRENT_VERSION, ['Current release']);
  await page.goto('/');
  await expect(page.locator('#installBtn')).not.toHaveClass(/update-available/);
  await expect(page.locator('#installBtn')).toHaveAttribute('aria-label', 'Install app');
  await openInstallDialog(page);

  await expect(page.locator('#releaseStatus')).toHaveText(`Up to date · ${CURRENT_VERSION}`);
  await expect(page.locator('#downloadUpdatesBtn')).toContainText('Check for updates');
});

test('highlights the shared Install control on secondary pages', async ({ page }) => {
  await mockRelease(page, '9.9.9', ['Shared update indicator']);
  await page.goto('/expenses/');

  await expect(page.locator('#installBtn')).toHaveClass(/update-available/);
  await expect(page.locator('#installBtn')).toHaveAttribute('aria-label', 'Update 9.9.9 available');
  await page.locator('#installBtn').click();
  await expect(page.locator('#installDialog')).toHaveAttribute('open', '');
  await expect(page.locator('#releaseNotes')).toContainText('Shared update indicator');
  await expect(page.locator('#releaseStatus')).toContainText(`Installed ${CURRENT_VERSION}`);
});

test('downloads updates without removing saved properties or unrelated caches', async ({ page }) => {
  await waitForServiceWorkerControl(page);
  await createProperty(page, { title: 'Update-safe property' });
  await mockRelease(page, '9.9.9', ['Cache refresh test']);

  await page.evaluate(async () => {
    const cache = await caches.open('playwright-unrelated-cache');
    await cache.put('/playwright-sentinel', new Response('keep'));
  });

  await openInstallDialog(page);
  await expect(page.locator('#downloadUpdatesBtn')).toContainText('Download updates');

  const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
  await page.locator('#downloadUpdatesBtn').click();
  await navigation;

  await expect(page.getByRole('heading', { name: 'Update-safe property', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(async ({ prefix }) => {
    const names = await caches.keys();
    return {
      hasUnrelatedCache: names.includes('playwright-unrelated-cache'),
      hasAppCache: names.some((name) => name.startsWith(prefix))
    };
  }, { prefix: APP_CACHE_PREFIX })).toEqual({
    hasUnrelatedCache: true,
    hasAppCache: true
  });
});

test('keeps unsaved editor changes when an update reload is cancelled', async ({ page }) => {
  await mockRelease(page, '9.9.9', ['Confirmation test']);
  await page.goto('/');
  await page.locator('#newPropertyBtn').click();
  await page.locator('#title').fill('Unsaved update draft');
  await page.locator('#purchasePrice').fill('275000');

  await openInstallDialog(page);
  await expect(page.locator('#downloadUpdatesBtn')).toContainText('Download updates');

  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#downloadUpdatesBtn').click();

  await expect(page.locator('#editorView')).not.toHaveClass(/hidden/);
  await expect(page.locator('#title')).toHaveValue('Unsaved update draft');
  await expect(page.locator('#purchasePrice')).toHaveValue('275,000');
  await expect(page.locator('#installDialog')).toHaveAttribute('open', '');
});

test('shows a safe retry message when an app-shell refresh fails', async ({ page }) => {
  await waitForServiceWorkerControl(page);
  await mockRelease(page, '9.9.9', ['Failure handling test']);
  await failAppAsset(page, 'calculations.js');

  await openInstallDialog(page);
  await expect(page.locator('#downloadUpdatesBtn')).toContainText('Download updates');
  await page.locator('#downloadUpdatesBtn').click();

  await expect(page.locator('#updateMessage')).toHaveText(
    'Could not download updates. Check your connection and try again.'
  );
  await expect(page.locator('#downloadUpdatesBtn')).toBeEnabled();
  await expect(page.locator('#installDialog')).toHaveAttribute('open', '');
});
