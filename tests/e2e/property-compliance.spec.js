import { test, expect } from '@playwright/test';
import { blockExternalServices } from './support/app-helpers.js';

test.beforeEach(async ({page}) => {
  await blockExternalServices(page);
  await page.addInitScript(() => {
    localStorage.setItem('spv-property-calculator.properties.v1', JSON.stringify([{
      id:'compliance-qa-property',title:'Compliance QA House',purchaseStage:'completed',
      purchasePrice:275000,depositPercent:25,completionDate:'2026-09-01',
      complianceRecords:{
        gas:{confirmed:true,expiryDate:'2026-11-10'},
        epc:{confirmed:true,expiryDate:'2031-11-20'}
      }
    }]));
  });
});

test('property compliance is accessible from portfolio and sorts overdue before long-valid EPC', async ({page}) => {
  await page.goto('/');
  await page.locator('#portfolioTab').click();
  await expect(page.getByRole('button',{name:'Compliance'})).toBeVisible();
  await page.getByRole('button',{name:'Compliance'}).click();
  await expect(page.locator('#propertyComplianceView')).toBeVisible();
  const items=page.locator('#propertyComplianceItems .property-compliance-item');
  await expect(items.first()).toContainText('Gas safety certificate');
  await expect(items.last()).toContainText('Energy performance certificate');
  await page.getByRole('tab',{name:'Safety & Certificates'}).click();
  await expect(page.locator('#propertyComplianceItems')).toContainText('Electrical safety');
  await expect(page.locator('#propertyComplianceItems')).not.toContainText('Deposit protection');
  await page.locator('#propertyComplianceBack').click();
  await expect(page.locator('#portfolioView')).toBeVisible();
});

test('compliance screen does not expose private records before sign in', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('#propertyComplianceView')).toBeHidden();
});
