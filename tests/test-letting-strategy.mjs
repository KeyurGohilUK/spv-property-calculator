import assert from 'node:assert/strict';
import {
  buildPriceSensitivity,
  calculateLettingStrategy,
  compareLettingStrategies,
  evaluateHmoSuitability,
  monthlyMortgagePayment
} from '../src/features/forecast/letting-strategy-calculations.js';

const interestOnly = monthlyMortgagePayment(224962.5, 5.5, 'interest-only', 25);
assert.ok(Math.abs(interestOnly - 1031.078125) < 0.01);

const family = calculateLettingStrategy({
  purchasePrice: 299950,
  purchaseCash: 125000,
  mortgageBalance: 224962.5,
  monthlyRent: 1600,
  annualRate: 5.5,
  maintenanceVoidPercent: 10
});
assert.ok(Math.abs(family.monthlyCashFlow - 408.92) < 0.1);
assert.ok(family.grossYield > 6.3 && family.grossYield < 6.5);

const property = {
  purchasePrice: 299950,
  depositPercent: 25,
  refurbishmentCost: 25000,
  solicitorFee: 2000,
  surveyCost: 700,
  mortgageBrokerFee: 500
};
const assumptions = {
  familyRent: 1600,
  roomRents: [725, 700, 625, 750],
  hmoBills: 550,
  btlRate: 5.5,
  hmoRate: 5.7,
  maintenanceVoidPercent: 10,
  managementPercent: 0,
  mortgageType: 'interest-only',
  mortgageTerm: 25
};
const comparison = compareLettingStrategies({ property, assumptions });
assert.equal(comparison.family.monthlyRent, 1600);
assert.equal(comparison.hmo3.monthlyRent, 2050);
assert.equal(comparison.hmo4.monthlyRent, 2800);
assert.ok(comparison.hmo3.monthlyCashFlow < comparison.family.monthlyCashFlow, '3-person HMO should underperform BTL under the Royal Road assumptions');
assert.ok(comparison.hmo4.monthlyCashFlow > comparison.family.monthlyCashFlow, '4-person HMO should outperform BTL under the Royal Road assumptions');
assert.ok(comparison.hmo4.differenceVsBtl > 450);

const passingScreen = evaluateHmoSuitability({
  occupants: 4,
  roomSizes: [13.7, 9.9, 7.2, 15.7],
  kitchenArea: 7,
  communalArea: 18
});
assert.equal(passingScreen.status, 'pass');

const shortCommunal = evaluateHmoSuitability({
  occupants: 4,
  roomSizes: [13.7, 9.9, 6.9, 15.7],
  kitchenArea: 16.1,
  communalArea: 16.1
});
assert.equal(shortCommunal.communal.status, 'fail');
assert.equal(shortCommunal.status, 'fail');

const missingMeasurements = evaluateHmoSuitability({ occupants: 4 });
assert.equal(missingMeasurements.status, 'check');

const sensitivity = buildPriceSensitivity({ property, prices: [275000, 285000, 299950], assumptions });
assert.equal(sensitivity.length, 3);
assert.ok(sensitivity[0].hmo4CashFlow > sensitivity[2].hmo4CashFlow);
assert.ok(sensitivity[0].purchaseCash < sensitivity[2].purchaseCash);

console.log('Letting strategy comparison checks passed.');
