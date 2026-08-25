import assert from 'node:assert/strict';

const records = [
  { id: 'active', title: 'Active', purchasePrice: 200000, depositPercent: 25, solicitorFee: 1000, refurbishmentCost: 8000, calculated: { totalCashRequired: 1 } },
  { id: 'archived', title: 'Archived', purchasePrice: 300000, deletedAt: '2026-08-25T00:00:00Z' }
];
globalThis.localStorage = { getItem: (key) => key.includes('properties') ? JSON.stringify(records) : null };

const { getForecastProperties, getForecastProperty, getPurchaseNumbers } = await import('./forecast-property.js');
const properties = getForecastProperties();
assert.deepEqual(properties.map((item) => item.id), ['active'], 'Forecast must use active properties from shared storage');
assert.equal(getForecastProperty('active')?.title, 'Active');
assert.equal(getForecastProperty('missing')?.id, 'active', 'Forecast must retain first-property fallback');

const purchase = getPurchaseNumbers(records[0]);
assert.equal(purchase.price, 200000);
assert.equal(purchase.deposit, 50000);
assert.equal(purchase.mortgage, 150000);
assert.equal(purchase.refurbishment, 8000);
assert.ok(purchase.cash > 50000, 'Shared calculation must include purchase costs');
assert.notEqual(purchase.cash, 1, 'Forecast must not trust stale saved calculation snapshots');

console.log('Shared Forecast property data checks passed.');