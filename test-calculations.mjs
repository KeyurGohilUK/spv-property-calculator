import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  calculateProperty,
  calculateSDLT,
  safeNumber
} from './calculations.js';

const scenarios = [
  { price: 100000, deposit: 25, expectedDeposit: 25000, expectedMortgage: 75000, expectedSDLT: 5000 },
  { price: 200000, deposit: 25, expectedDeposit: 50000, expectedMortgage: 150000, expectedSDLT: 11500 },
  { price: 300000, deposit: 25, expectedDeposit: 75000, expectedMortgage: 225000, expectedSDLT: 20000 },
  { price: 500000, deposit: 30, expectedDeposit: 150000, expectedMortgage: 350000, expectedSDLT: 40000 },
  { price: 1000000, deposit: 25, expectedDeposit: 250000, expectedMortgage: 750000, expectedSDLT: 93750 }
];

for (const scenario of scenarios) {
  const result = calculateProperty({
    purchasePrice: scenario.price,
    depositPercent: scenario.deposit,
    qualifyingCorporateRelief: true
  });
  assert.equal(result.depositAmount, scenario.expectedDeposit, `Deposit failed for £${scenario.price}`);
  assert.equal(result.mortgageRequired, scenario.expectedMortgage, `Mortgage failed for £${scenario.price}`);
  assert.equal(result.sdlt.total, scenario.expectedSDLT, `SDLT failed for £${scenario.price}`);
}

// Boundaries most likely to change behaviour or expose an off-by-one error.
const sdltBoundaries = [
  { price: 0, expected: 0, method: 'none' },
  { price: 39999, expected: 0, method: 'standard-bands' },
  { price: 40000, expected: 2000, method: 'company-higher-rates' },
  { price: 125000, expected: 6250, method: 'company-higher-rates' },
  { price: 125001, expected: 6250.07, method: 'company-higher-rates' },
  { price: 250000, expected: 15000, method: 'company-higher-rates' },
  { price: 250001, expected: 15000.10, method: 'company-higher-rates' },
  { price: 500000, expected: 40000, method: 'company-higher-rates' },
  { price: 500001, expected: 40000.10, method: 'company-higher-rates' },
  { price: 925000, expected: 82500, method: 'company-higher-rates' },
  { price: 1500000, expected: 168750, method: 'company-higher-rates' },
  { price: 1500001, expected: 168750.17, method: 'company-higher-rates' }
];

for (const boundary of sdltBoundaries) {
  const result = calculateSDLT(boundary.price, { qualifyingCorporateRelief: true });
  assert.ok(
    Math.abs(result.total - boundary.expected) < 0.001,
    `SDLT boundary failed for £${boundary.price}: expected ${boundary.expected}, received ${result.total}`
  );
  assert.equal(result.method, boundary.method, `Unexpected method for £${boundary.price}`);
}

const withFees = calculateProperty({
  purchasePrice: 300000,
  depositPercent: 25,
  solicitorFee: 1800,
  surveyCost: 600,
  mortgageArrangementFee: 1995,
  mortgageBrokerFee: 500,
  mortgageValuationFee: 350,
  companyFormationCost: 50,
  spvAdministrationCost: 300,
  landRegistrySearches: 450,
  insuranceCost: 300,
  auctionReservationFee: 0,
  refurbishmentCost: 15000,
  customExpenses: [{ name: 'Specialist report', amount: 800 }],
  qualifyingCorporateRelief: true
});
assert.equal(withFees.totalCashRequired, 117145, 'Fees/refurbishment total cash calculation failed');
assert.equal(withFees.totalPurchaseCostsIncludingDeposit, 102145, 'Purchase cash before refurbishment failed');

const corporateThreshold = calculateSDLT(500000, { qualifyingCorporateRelief: false });
assert.equal(corporateThreshold.method, 'company-higher-rates', '17% whole-price rate must apply only above £500,000');

const corporateFlat = calculateSDLT(500001, { qualifyingCorporateRelief: false });
assert.ok(Math.abs(corporateFlat.total - 85000.17) < 0.001, '17% corporate whole-price calculation failed');
assert.equal(corporateFlat.method, 'corporate-flat-rate');

const nonResident = calculateSDLT(300000, { qualifyingCorporateRelief: true, nonResident: true });
assert.equal(nonResident.total, 26000, 'Non-resident surcharge calculation failed');

const nonResidentCorporateFlat = calculateSDLT(1000000, {
  qualifyingCorporateRelief: false,
  nonResident: true
});
assert.ok(Math.abs(nonResidentCorporateFlat.total - 190000) < 0.001, 'Non-resident corporate whole-price calculation failed');

assert.equal(safeNumber('£250,000.50'), 250000.50, 'Formatted currency parsing failed');
assert.equal(safeNumber('not a number'), 0, 'Invalid numeric input must safely become zero');

const clamped = calculateProperty({
  purchasePrice: -100,
  depositPercent: 250,
  solicitorFee: -500,
  refurbishmentCost: -1000
});
assert.equal(clamped.purchasePrice, 0, 'Purchase price must not become negative');
assert.equal(clamped.depositPercent, 100, 'Deposit percentage must be clamped');
assert.equal(clamped.refurbishment, 0, 'Refurbishment must not become negative');

// The browser must execute the exact modules tested above. This prevents a second,
// untested copy of the tax rules from drifting inside app.js.
const productionApp = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
assert.match(productionApp, /from '\.\/calculations\.js'/, 'Production app must import calculations.js');
assert.match(productionApp, /from '\.\/storage\.js'/, 'Production app must import storage.js');
assert.doesNotMatch(productionApp, /function calculateSDLT\s*\(/, 'Production app contains a duplicated SDLT implementation');
assert.doesNotMatch(productionApp, /const TAX_CONFIG\s*=\s*Object\.freeze/, 'Production app contains duplicated tax configuration');

console.log('All calculation and production-parity tests passed.');
