import { test, expect } from '@playwright/test';
import { blockExternalServices } from './support/app-helpers.js';

test.beforeEach(async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Core Forecast strategy flow is covered once in Chromium.');
  await blockExternalServices(page);
  await page.addInitScript(() => {
    localStorage.setItem('spv-property-calculator.properties.v1', JSON.stringify([{
      id: 'royal-road',
      title: 'Royal Road, Mangotsfield',
      purchasePrice: 299950,
      depositPercent: 25,
      refurbishmentCost: 25000,
      solicitorFee: 2000,
      surveyCost: 700,
      mortgageBrokerFee: 500,
      updatedAt: new Date().toISOString()
    }]));
  });
});

test('Forecast compares BTL, 3-person HMO and 4-person HMO clearly', async ({ page }) => {
  await page.goto('/forecast/');

  await expect(page.getByRole('heading', { name: 'BTL vs 3 HMO vs 4 HMO' })).toBeVisible();
  await expect(page.locator('.strategy-card')).toHaveCount(3);
  await expect(page.locator('.strategy-card').filter({ hasText: 'Family BTL' })).toBeVisible();
  await expect(page.locator('.strategy-card').filter({ hasText: '3-Person HMO' })).toBeVisible();
  await expect(page.locator('.strategy-card').filter({ hasText: '4-Person HMO' })).toBeVisible();

  await page.locator('#strategyFamilyRent').fill('1600');
  await page.locator('#strategyRoom1Rent').fill('725');
  await page.locator('#strategyRoom2Rent').fill('700');
  await page.locator('#strategyRoom3Rent').fill('625');
  await page.locator('#strategyRoom4Rent').fill('750');

  await expect(page.locator('#strategyHmo3Rent')).toContainText('2,050');
  await expect(page.locator('#strategyHmo4Rent')).toContainText('2,800');
  await expect(page.locator('#strategyInsight')).toContainText('3 HMO vs BTL');
  await expect(page.locator('#strategyInsight')).toContainText('4 HMO vs BTL');
});

test('Forecast HMO screening flags insufficient communal space', async ({ page }) => {
  await page.goto('/forecast/');
  await page.getByText('HMO suitability screening').click();
  await page.locator('#strategyRoom1Size').fill('13.7');
  await page.locator('#strategyRoom2Size').fill('9.9');
  await page.locator('#strategyRoom3Size').fill('6.9');
  await page.locator('#strategyRoom4Size').fill('15.7');
  await page.locator('#strategyKitchenArea').fill('16.1');
  await page.locator('#strategyCommunalArea').fill('16.1');

  await expect(page.locator('#strategySuitabilityResult')).toContainText('Does not pass entered-size screening');
  await expect(page.locator('#strategySuitabilityResult')).toContainText('4-person benchmark 17 m²');
});

test('Forecast keeps BTL and HMO strategy cards side by side on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/forecast/');
  const cards = page.locator('.strategy-card');
  const container = page.locator('.strategy-cards');
  await expect(cards).toHaveCount(3);
  await expect.poll(() => container.evaluate((element) => getComputedStyle(element).display)).toBe('flex');

  const boxes = await cards.evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
  const rows = boxes.map((box) => box.y);
  expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(2);
  expect(boxes.every((box) => box.width >= 280)).toBeTruthy();

  const dimensions = await container.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth
  }));
  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
});
