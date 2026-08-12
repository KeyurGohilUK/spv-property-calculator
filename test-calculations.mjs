import assert from 'node:assert/strict';
import { calculateProperty, calculateSDLT } from './calculations.js';

const scenarios = [
  { price: 100000, deposit: 25, expectedDeposit: 25000, expectedMortgage: 75000, expectedSDLT: 5000 },
  { price: 200000, deposit: 25, expectedDeposit: 50000, expectedMortgage: 150000, expectedSDLT: 11500 },
  { price: 300000, deposit: 25, expectedDeposit: 75000, expectedMortgage: 225000, expectedSDLT: 20000 },
  { price: 500000, deposit: 30, expectedDeposit: 150000, expectedMortgage: 350000, expectedSDLT: 40000 },
  { price: 1000000, deposit: 25, expectedDeposit: 250000, expectedMortgage: 750000, expectedSDLT: 93750 }
];

for (const s of scenarios) {
  const result = calculateProperty({ purchasePrice: s.price, depositPercent: s.deposit, qualifyingCorporateRelief: true });
  assert.equal(result.depositAmount, s.expectedDeposit, `Deposit failed for £${s.price}`);
  assert.equal(result.mortgageRequired, s.expectedMortgage, `Mortgage failed for £${s.price}`);
  assert.equal(result.sdlt.total, s.expectedSDLT, `SDLT failed for £${s.price}`);
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

const corporateFlat = calculateSDLT(1000000, { qualifyingCorporateRelief: false });
assert.equal(corporateFlat.total, 170000, '17% corporate whole-price calculation failed');
assert.equal(corporateFlat.method, 'corporate-flat-rate');

const nonResident = calculateSDLT(300000, { qualifyingCorporateRelief: true, nonResident: true });
assert.equal(nonResident.total, 26000, 'Non-resident surcharge calculation failed');

console.log('All calculation tests passed.');
