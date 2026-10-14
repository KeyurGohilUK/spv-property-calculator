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

  await openContainingSection(page, '#addRefurbishmentItemBtn');
  await page.locator('#addRefurbishmentItemBtn').click();
  const refurbishmentRow = page.locator('#refurbishmentItems .expense-row').first();
  await refurbishmentRow.locator('[data-cost-name]').fill('Initial works');
  await refurbishmentRow.locator('[data-cost-amount]').fill('10000');
  await expect(page.locator('#summaryRefurbishment')).toHaveText('£10,000');
  await expect(page.locator('#summaryTotalCash')).toHaveText('£87,500');
});

test('saves a property and edits it by clicking its card', async ({ page }) => {
  await createProperty(page);

  const savedCard = page.locator('.property-card').filter({ hasText: 'Playwright Test Property' });
  await expect(savedCard).not.toHaveAttribute('role', 'button');
  await expect(savedCard.locator('.property-map-link')).toHaveAttribute(
    'href',
    'https://www.google.com/maps/search/?api=1&query=Playwright%20Test%20Property'
  );
  const openCard = savedCard.getByRole('button', { name: 'Open Playwright Test Property for editing' });
  await openCard.focus();
  await openCard.press('Enter');
  await expect(page.locator('#editorView')).not.toHaveClass(/hidden/);
  await expect(page.locator('#title')).toHaveValue('Playwright Test Property');

  await page.locator('#title').fill('Updated Playwright Property');
  await page.locator('#purchasePrice').click();
  await page.locator('#purchasePrice').press('ControlOrMeta+A');
  await page.locator('#purchasePrice').pressSequentially('300000');
  await page.locator('#savePropertyBtn').click();
  await expect(page.locator('#saveMessage')).toContainText(/Saved (?:on this device|locally and synced to Supabase)/);
  await page.locator('#backBtn').click();

  const card = page.locator('.property-card').filter({ hasText: 'Updated Playwright Property' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('£300,000');
});

test('tracks individual refurbishment items and persists their calculated total', async ({ page }) => {
  await page.goto('/');
  await page.locator('#newPropertyBtn').click();
  await page.locator('#title').fill('Itemised Refurbishment');
  await page.locator('#purchasePrice').fill('250000');
  await openContainingSection(page, '#addRefurbishmentItemBtn');

  await page.locator('#addRefurbishmentItemBtn').click();
  let rows = page.locator('#refurbishmentItems .expense-row');
  await rows.nth(0).locator('[data-cost-name]').fill('Windows');
  await rows.nth(0).locator('[data-cost-amount]').fill('6000');

  await page.locator('#addRefurbishmentItemBtn').click();
  rows = page.locator('#refurbishmentItems .expense-row');
  await rows.nth(1).locator('[data-cost-name]').fill('Kitchen');
  await rows.nth(1).locator('[data-cost-amount]').fill('7000');

  await expect(page.locator('#refurbishmentInline')).toHaveText('£13,000');
  await expect(page.locator('#summaryRefurbishment')).toHaveText('£13,000');
  await expect(page.locator('#summaryTotalCash')).toHaveText('£90,500');

  await page.locator('#savePropertyBtn').click();
  await page.locator('#backBtn').click();
  const card = page.locator('.property-card').filter({ hasText: 'Itemised Refurbishment' });
  await expect(card).toContainText('£13,000');
  await card.getByRole('button', { name: 'Open Itemised Refurbishment for editing' }).click();
  await openContainingSection(page, '#addRefurbishmentItemBtn');

  rows = page.locator('#refurbishmentItems .expense-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('[data-cost-name]')).toHaveValue('Windows');
  await expect(rows.nth(0).locator('[data-cost-amount]')).toHaveValue('6,000');
  await expect(rows.nth(1).locator('[data-cost-name]')).toHaveValue('Kitchen');
  await expect(rows.nth(1).locator('[data-cost-amount]')).toHaveValue('7,000');

  await rows.nth(0).getByRole('button', { name: 'Remove refurbishment item' }).click();
  await expect(page.locator('#refurbishmentInline')).toHaveText('£7,000');
  await expect(page.locator('#summaryTotalCash')).toHaveText('£84,500');
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
  const viewingInput = await page.locator('#viewingDateDay').boundingBox();
  const calendarIcon = await editorCalendarButton.boundingBox();
  expect(viewingRow && viewingInput && calendarIcon).toBeTruthy();
  expect(Math.abs(
    (viewingInput.y + viewingInput.height / 2) - (calendarIcon.y + calendarIcon.height / 2)
  )).toBeLessThanOrEqual(2);
  expect(calendarIcon.x + calendarIcon.width).toBeLessThanOrEqual(viewingRow.x + viewingRow.width + 1);

  await page.locator('#savePropertyBtn').click();
  await page.locator('#backBtn').click();

  const card = page.locator('.property-card').filter({ hasText: 'Calendar Viewing' });
  await expect(card.locator('.property-viewing-date')).not.toHaveClass(/viewed/);
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
  const propertyCard = page.locator('.property-card').filter({ hasText: 'Archive Journey' });
  await propertyCard.locator('summary[aria-label="More actions for Archive Journey"]').click();
  await propertyCard.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Archive Journey' })).toBeHidden();

  await page.locator('#moreNavBtn').click();
  await page.locator('#archiveBtn').click();
  await expect(page.locator('#archiveView')).not.toHaveClass(/hidden/);
  const archivedCard = page.locator('.archived-card').filter({ hasText: 'Archive Journey' });
  await expect(archivedCard).toContainText('£275,000');
  await expect(archivedCard).toContainText('£12,000');

  await archivedCard.getByRole('button', { name: 'Restore Property' }).click();
  await page.locator('#propertiesNavLink').click();
  await expect(page.getByRole('heading', { name: 'Archive Journey' })).toBeVisible();
  await expect(page.locator('#propertyCount')).toHaveText('1');
});

test('property cards keep their content height when another card is taller', async ({ page }) => {
  await createProperty(page, { title: 'Short Card', price: '200000' });
  await createProperty(page, { title: 'Tall Card', price: '300000' });

  await page.locator('.property-card').filter({ hasText: 'Tall Card' }).evaluate((card) => {
    const spacer = document.createElement('div');
    spacer.style.height = '100px';
    spacer.setAttribute('aria-hidden', 'true');
    card.appendChild(spacer);
  });

  const shortHeight = await page.locator('.property-card').filter({ hasText: 'Short Card' }).evaluate((card) => card.getBoundingClientRect().height);
  const tallHeight = await page.locator('.property-card').filter({ hasText: 'Tall Card' }).evaluate((card) => card.getBoundingClientRect().height);
  expect(tallHeight - shortHeight).toBeGreaterThan(80);
});


test('property card cost amounts use the full totals panel width', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 900 });
  await createProperty(page, { title: 'Full Width Totals', price: '250000', refurbishment: '10000' });

  const panel = page.locator('.property-card').filter({ hasText: 'Full Width Totals' }).locator('.property-cost-breakdown');
  await expect(panel).toBeVisible();

  const alignment = await panel.evaluate((element) => {
    const panelRight = element.getBoundingClientRect().right;
    return [...element.querySelectorAll(':scope > div strong')].map((amount) =>
      panelRight - amount.getBoundingClientRect().right
    );
  });

  expect(alignment).toHaveLength(3);
  alignment.forEach((rightInset) => expect(rightInset).toBeGreaterThanOrEqual(12));
  alignment.forEach((rightInset) => expect(rightInset).toBeLessThanOrEqual(16));
});

test('@mobile mobile save control remains fixed while the editor scrolls', async ({ page, browserName }) => {
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

for (const route of ['/', '/expenses/', '/forecast/']) {
  test(`only Forecast keeps the Beta badge on ${route}`, async ({ page }) => {
    await page.goto(route);

    const expenseItem = page.locator('.primary-nav-item[href="./expenses/"]');
    const forecastItem = page.locator('.primary-nav-item[href="./forecast/"]');
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
  await expect.poll(() => page.evaluate(() => document.querySelector('#authDialog')?.contains(document.activeElement))).toBe(true);
  await page.locator('#closeAuthDialog').click();
  await expect(page.locator('#accountBtn')).toBeFocused();

  await page.locator('#installBtn').click();
  await expect(page.locator('#installDialog')).toHaveAttribute('open', '');
  await page.locator('#closeInstallDialog').click();
  await expect(page.locator('#installBtn')).toBeFocused();

  await page.locator('#moreNavBtn').click();
  await expect(page.getByRole('heading', { name: 'App Menu' })).toBeVisible();
  await page.locator('#closeMoreMenuDialog').click();
  await expect(page.locator('#moreNavBtn')).toBeFocused();

  await expect(page).toHaveURL(originalUrl);
});

for (const route of ['/expenses/', '/forecast/']) {
  test(`secondary-page controls behave as dialogs on ${route}`, async ({ page }) => {
    await page.goto(route);
    const originalUrl = page.url();

    await page.locator('#accountBtn').click();
    await expect(page.locator('#secondaryAccountDialog')).toHaveAttribute('open', '');
    await page.locator('#closeSecondaryAccount').click();

    await page.locator('#installBtn').click();
    await expect(page.locator('#installDialog')).toHaveAttribute('open', '');
    await page.locator('#closeInstallDialog').click();

    await page.locator('[data-more-menu]').click();
    await expect(page.getByRole('heading', { name: 'App Menu' })).toBeVisible();
    await page.locator('#closeMoreMenuDialog').click();

    await expect(page).toHaveURL(originalUrl);
  });
}


test('records listing price reductions alongside the full offer history', async ({ page }) => {
  await createProperty(page, { title: 'Listing Reduction Journey', price: '250000' });
  const card = page.locator('.property-card').filter({ hasText: 'Listing Reduction Journey' });
  await card.getByRole('button', { name: 'Open Listing Reduction Journey for editing' }).click();

  await page.locator('#priceNegotiationSection > summary').click();
  await page.locator('#priceEntryType').selectOption('price_reduction');
  await expect(page.locator('#priceEntryAmountLabel')).toHaveText('New listing price');
  await page.locator('#priceEntryAmount').fill('235000');
  await page.locator('#priceEntryDate').fill('2026-10-14');
  await page.locator('#priceEntryNote').fill('Seller reduced asking price');
  await page.locator('#addPriceEntryBtn').click();
  await expect(page.locator('#summaryPurchasePrice')).toHaveText('£235,000');
  await expect(page.locator('#priceHistoryList')).toContainText('Original listing price');
  await expect(page.locator('#priceHistoryList')).toContainText('Listing price reduced');
  await expect(page.locator('#priceHistoryList')).toContainText('Seller reduced asking price');

  await page.locator('#priceEntryType').selectOption('offer');
  await page.locator('#priceEntryAmount').fill('225000');
  await page.locator('#priceEntryDate').fill('2026-10-15');
  await page.locator('#addPriceEntryBtn').click();
  await page.locator('#priceEntryType').selectOption('counteroffer');
  await page.locator('#priceEntryAmount').fill('230000');
  await page.locator('#priceEntryDate').fill('2026-10-16');
  await page.locator('#addPriceEntryBtn').click();
  await expect(page.locator('#summaryPurchasePrice')).toHaveText('£230,000');

  await page.locator('#backBtn').click();
  const savedCard = page.locator('.property-card').filter({ hasText: 'Listing Reduction Journey' });
  await savedCard.getByRole('button', { name: 'Open Listing Reduction Journey for editing' }).click();
  await page.locator('#priceNegotiationSection > summary').click();
  await expect(page.locator('#priceHistoryList')).toContainText('£250,000');
  await expect(page.locator('#priceHistoryList')).toContainText('£235,000');
  await expect(page.locator('#priceHistoryList')).toContainText('£225,000');
  await expect(page.locator('#priceHistoryList')).toContainText('£230,000');
  await expect(page.locator('#priceHistoryList')).toContainText('Seller reduced asking price');
  await expect(page.locator('#summaryPurchasePrice')).toHaveText('£230,000');
});

test('accepts a listing reduction below the current calculator price', async ({ page }) => {
  await createProperty(page, { title: 'Current Price Reduction', price: '261000' });
  const card = page.locator('.property-card').filter({ hasText: 'Current Price Reduction' });
  await card.getByRole('button', { name: 'Open Current Price Reduction for editing' }).click();

  await page.locator('#purchasePrice').click();
  await page.locator('#purchasePrice').press('ControlOrMeta+A');
  await page.locator('#purchasePrice').pressSequentially('300000');
  await page.locator('#savePropertyBtn').click();
  await page.locator('#priceNegotiationSection > summary').click();
  await expect(page.locator('#priceHistoryList')).toContainText('Original listing price');
  await expect(page.locator('#priceHistoryList')).toContainText('£261,000');
  await expect(page.locator('#priceHistoryCurrentPrice')).toHaveText('£300,000');

  await page.locator('#priceEntryType').selectOption('price_reduction');
  await page.locator('#priceEntryAmount').fill('284950');
  await page.locator('#priceEntryDate').fill('2026-10-12');
  await page.locator('#addPriceEntryBtn').click();

  await expect(page.locator('#priceEntryError')).toBeHidden();
  await expect(page.locator('#priceHistoryList')).toContainText('Listing price reduced');
  await expect(page.locator('#priceHistoryList')).toContainText('£284,950');
  await expect(page.locator('#summaryPurchasePrice')).toHaveText('£284,950');
});

test('records offer and counteroffer history and recalculates from the latest price', async ({ page }) => {
  await createProperty(page, { title: 'Offer History Journey', price: '250000' });
  const card = page.locator('.property-card').filter({ hasText: 'Offer History Journey' });
  await card.getByRole('button', { name: 'Open Offer History Journey for editing' }).click();

  await page.locator('#priceNegotiationSection > summary').click();
  await expect(page.locator('#priceHistorySectionTotal')).toHaveText('£250,000');
  await expect(page.locator('#priceHistoryList')).toContainText('Original listing price');
  await expect(page.locator('#priceHistoryList')).toContainText('£250,000');

  await page.locator('#priceEntryType').selectOption('offer');
  await page.locator('#priceEntryAmount').fill('240000');
  await page.locator('#priceEntryDate').fill('2026-10-12');
  await page.locator('#priceEntryNote').fill('Initial offer');
  await page.locator('#addPriceEntryBtn').click();
  await expect(page.locator('#summaryPurchasePrice')).toHaveText('£240,000');
  await expect(page.locator('#priceHistoryList')).toContainText('Initial offer');

  await page.locator('#priceEntryType').selectOption('counteroffer');
  await page.locator('#priceEntryAmount').fill('245000');
  await page.locator('#priceEntryDate').fill('2026-10-13');
  await page.locator('#priceEntryNote').fill('Seller countered');
  await page.locator('#addPriceEntryBtn').click();
  await expect(page.locator('#summaryPurchasePrice')).toHaveText('£245,000');
  await expect(page.locator('#priceHistoryList')).toContainText('Seller countered');

  await page.locator('#backBtn').click();
  const updatedCard = page.locator('.property-card').filter({ hasText: 'Offer History Journey' });
  await updatedCard.getByRole('button', { name: 'Open Offer History Journey for editing' }).click();
  await page.locator('#priceNegotiationSection > summary').click();
  await expect(page.locator('#priceHistoryList')).toContainText('£250,000');
  await expect(page.locator('#priceHistoryList')).toContainText('£240,000');
  await expect(page.locator('#priceHistoryList')).toContainText('£245,000');
  await expect(page.locator('#summaryPurchasePrice')).toHaveText('£245,000');
});


test('keeps the negotiation date field within its card on mobile @mobile', async ({ page }) => {
  await createProperty(page, { title: 'Mobile Price Date Layout' });
  const propertyCard = page.locator('.property-card').filter({ hasText: 'Mobile Price Date Layout' });
  await propertyCard.getByRole('button', { name: 'Open Mobile Price Date Layout for editing' }).click();
  await page.locator('#priceNegotiationSection > summary').click();

  const dateField = page.locator('#priceEntryDate');
  const dateFieldContainer = page.locator('.price-entry-date-field');
  const section = page.locator('#priceNegotiationSection');
  const dateBounds = await dateField.boundingBox();
  const containerBounds = await dateFieldContainer.boundingBox();
  const sectionBounds = await section.boundingBox();
  expect(dateBounds).toBeTruthy();
  expect(containerBounds).toBeTruthy();
  expect(sectionBounds).toBeTruthy();
  expect(dateBounds.x).toBeGreaterThanOrEqual(containerBounds.x);
  expect(dateBounds.x + dateBounds.width).toBeLessThanOrEqual(containerBounds.x + containerBounds.width);
  expect(dateBounds.x).toBeGreaterThanOrEqual(sectionBounds.x);
  expect(dateBounds.x + dateBounds.width).toBeLessThanOrEqual(sectionBounds.x + sectionBounds.width);
});
