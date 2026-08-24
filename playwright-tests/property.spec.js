import { test, expect } from '@playwright/test';
import { blockExternalServices, createProperty, openContainingSection } from './support/app-helpers.js';

async function downloadText(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

test.beforeEach(async ({ page }) => {
  await blockExternalServices(page);
});

test('calculates a known £250,000 SPV purchase correctly', async ({ page }) => {
  await page.goto('/');
  await page.locator('#newPropertyBtn').click();
  await page.locator('#title').fill('Known Calculation');
  await page.locator('#purchasePrice').fill('250000');

  await expect(page.locator('#summaryPurchasePrice')).toHaveText('£250,000');
  await expect(page.locator('#summaryDepositPercent')).toHaveText('25%');
  await expect(page.locator('#summaryDeposit')).toHaveText('£62,500');
  await expect(page.locator('#summaryMortgage')).toHaveText('£187,500');
  await expect(page.locator('#summarySDLT')).toHaveText('£15,000');
  await expect(page.locator('#summaryCostsExDeposit')).toHaveText('£15,000');
  await expect(page.locator('#summaryCostsIncDeposit')).toHaveText('£77,500');
  await expect(page.locator('#summaryTotalCash')).toHaveText('£77,500');

  await openContainingSection(page, '#refurbishmentCost');
  await page.locator('#refurbishmentCost').fill('10000');
  await expect(page.locator('#summaryRefurbishment')).toHaveText('£10,000');
  await expect(page.locator('#summaryTotalCash')).toHaveText('£87,500');
});

test('saves a property and edits it by clicking its card', async ({ page }) => {
  await createProperty(page);

  await page.locator('.property-card').filter({ hasText: 'Playwright Test Property' }).click();
  await expect(page.locator('#editorView')).not.toHaveClass(/hidden/);
  await expect(page.locator('#title')).toHaveValue('Playwright Test Property');

  await page.locator('#title').fill('Updated Playwright Property');
  await page.locator('#purchasePrice').click();
  await page.locator('#purchasePrice').press('ControlOrMeta+A');
  await page.locator('#purchasePrice').pressSequentially('300000');
  await page.locator('#savePropertyBtn').click();
  await expect(page.locator('#saveMessage')).toContainText('Saved on this device');
  await page.locator('#backBtn').click();

  const card = page.locator('.property-card').filter({ hasText: 'Updated Playwright Property' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('£300,000');
});

test('downloads a calendar invite for a future property viewing', async ({ page }) => {
  await page.goto('/');
  await page.locator('#newPropertyBtn').click();
  await page.locator('#title').fill('Calendar Viewing');
  await page.locator('#details').fill('Meet the agent at the front entrance.');
  await page.locator('#listingUrl').fill('https://example.com/calendar-viewing');
  await page.locator('#viewingDateDay').fill('2099-12-01');
  await page.locator('#viewingTime').selectOption('14:30');
  await page.locator('#purchasePrice').fill('260000');

  const editorCalendarButton = page.locator('#addViewingToCalendarBtn');
  await expect(editorCalendarButton).toBeVisible();
  await expect(editorCalendarButton).toHaveText('');

  const viewingRow = await page.locator('.viewing-date-input').boundingBox();
  const viewingInput = await page.locator('#viewingDate').boundingBox();
  const calendarIcon = await editorCalendarButton.boundingBox();
  expect(viewingRow && viewingInput && calendarIcon).toBeTruthy();
  expect(Math.abs(
    (viewingInput.y + viewingInput.height / 2) - (calendarIcon.y + calendarIcon.height / 2)
  )).toBeLessThanOrEqual(2);
  expect(calendarIcon.x + calendarIcon.width).toBeLessThanOrEqual(viewingRow.x + viewingRow.width + 1);

  await page.locator('#savePropertyBtn').click();
  await page.locator('#backBtn').click();

  const card = page.locator('.property-card').filter({ hasText: 'Calendar Viewing' });
  const calendarButton = card.getByRole('button', {
    name: 'Add viewing for Calendar Viewing to calendar'
  });
  await expect(calendarButton).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await calendarButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('calendar-viewing-viewing.ics');

  const invite = await downloadText(download);
  expect(invite).toContain('BEGIN:VCALENDAR');
  expect(invite).toContain('SUMMARY:Property Viewing - Calendar Viewing');
  expect(invite).toContain('Meet the agent at the front entrance.');
  expect(invite).toContain('URL:https://example.com/calendar-viewing');
  expect(invite).toContain('TRIGGER:-PT1H');
  expect(invite).toMatch(/DTSTART:\d{8}T\d{6}Z/);
  expect(invite).toMatch(/DTEND:\d{8}T\d{6}Z/);
});

test('archives and restores a property without losing its calculation', async ({ page }) => {
  await createProperty(page, { title: 'Archive Journey', price: '275000', refurbishment: '12000' });

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Archive Archive Journey' }).click();
  await expect(page.getByRole('heading', { name: 'Archive Journey' })).toBeHidden();

  await page.locator('#moreNavBtn').click();
  await page.locator('#archiveBtn').click();
  await expect(page.locator('#archiveView')).not.toHaveClass(/hidden/);
  const archivedCard = page.locator('.archived-card').filter({ hasText: 'Archive Journey' });
  await expect(archivedCard).toContainText('£275,000');
  await expect(archivedCard).toContainText('£12,000');

  await archivedCard.getByRole('button', { name: 'Restore Property' }).click();
  await page.locator('#archiveBackBtn').click();
  await expect(page.getByRole('heading', { name: 'Archive Journey' })).toBeVisible();
  await expect(page.locator('#propertyCount')).toHaveText('1');
});

test('mobile save control remains fixed while the editor scrolls', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'Mobile WebKit regression');
  await page.goto('/');
  await page.locator('#newPropertyBtn').click();
  await page.locator('#title').fill('Sticky Save Test');
  await page.locator('#purchasePrice').fill('200000');

  const before = await page.locator('#savePropertyBtn').boundingBox();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const after = await page.locator('#savePropertyBtn').boundingBox();

  expect(before && after).toBeTruthy();
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2);
  expect(after.y).toBeGreaterThanOrEqual(0);
  expect(after.y + after.height).toBeLessThanOrEqual(844);
});

for (const route of ['/', '/expenses.html', '/forecast.html']) {
  test(`only Forecast keeps the Beta badge on ${route}`, async ({ page }) => {
    await page.goto(route);

    const expenseItem = page.locator('.primary-nav-item[href="./expenses.html"]');
    const forecastItem = page.locator('.primary-nav-item[href="./forecast.html"]');
    await expect(expenseItem).toContainText('Expenses');
    await expect(expenseItem.locator('small')).toHaveCount(0);
    await expect(forecastItem.locator('small')).toHaveText('Beta');
  });
}

test('home Account, Install and More controls open dialogs without navigation', async ({ page }) => {
  await page.goto('/');
  const originalUrl = page.url();

  await page.locator('#accountBtn').click();
  await expect(page.locator('#authDialog')).toHaveAttribute('open', '');
  await page.locator('#closeAuthDialog').click();

  await page.locator('#installBtn').click();
  await expect(page.locator('#installDialog')).toHaveAttribute('open', '');
  await page.locator('#closeInstallDialog').click();

  await page.locator('#moreNavBtn').click();
  await expect(page.getByRole('heading', { name: 'App Menu' })).toBeVisible();
  await page.locator('#closeMoreMenuDialog').click();

  await expect(page).toHaveURL(originalUrl);
});

for (const route of ['/expenses.html', '/forecast.html']) {
  test(`secondary-page controls behave as dialogs on ${route}`, async ({ page }) => {
    await page.goto(route);
    const originalUrl = page.url();

    await page.locator('#secondaryAccountBtn').click();
    await expect(page.locator('#secondaryAccountDialog')).toHaveAttribute('open', '');
    await page.locator('#closeSecondaryAccount').click();

    await page.locator('#secondaryInstallBtn').click();
    await expect(page.locator('#secondaryInstallDialog')).toHaveAttribute('open', '');
    await page.locator('#closeSecondaryInstall').click();

    await page.locator('[data-more-menu]').click();
    await expect(page.getByRole('heading', { name: 'App Menu' })).toBeVisible();
    await page.locator('#closeSecondaryMoreMenu').click();

    await expect(page).toHaveURL(originalUrl);
  });
}
