import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { blockExternalServices } from './support/app-helpers.js';

const pages = [
  ['Properties', '/'],
  ['Expenses', '/expenses.html'],
  ['Forecast', '/forecast.html'],
  ['Manage users', '/manage-users.html']
];

test.describe('automated accessibility checks', () => {
  for (const [name, path] of pages) {
    test(name + ' has no detectable WCAG A or AA violations', async ({ page }) => {
      await blockExternalServices(page);
      await page.goto(path);
      await page.locator('main').waitFor();

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const summary = results.violations
        .map(({ id, impact, help, nodes }) => id + ' (' + impact + '): ' + help + ' [' + nodes.length + ' node(s)]')
        .join('\n');

      expect(results.violations, summary).toEqual([]);
    });
  }
});
