import assert from 'node:assert/strict';
import { BRRR_DEFAULTS, calcBrrr, calcBreakeven } from '../src/features/forecast/brrr-calculations.js';

const scenario = calcBrrr(150000, BRRR_DEFAULTS);
assert.equal(scenario.offerPrice, 150000);
assert.ok(scenario.totalCashIn > 0);
assert.ok(scenario.refinanceMortgage >= 0);
assert.ok(Number.isFinite(scenario.monthlyCashFlow));
assert.ok(Number.isFinite(scenario.grossYield));

const breakeven = calcBreakeven(BRRR_DEFAULTS);
assert.ok(breakeven > 0, 'default assumptions should produce a positive breakeven offer');

const atBreakeven = calcBrrr(breakeven, BRRR_DEFAULTS);
assert.ok(Math.abs(atBreakeven.capitalLeft) < 0.01, 'breakeven should leave approximately zero capital in the deal');

const noStressRate = calcBrrr(150000, { ...BRRR_DEFAULTS, stressRate: 0 });
assert.equal(noStressRate.icrLimit, 0);
assert.equal(noStressRate.refinanceMortgage, 0);
assert.ok(Number.isFinite(noStressRate.capitalLeft));

const zeroGdv = calcBrrr(150000, { ...BRRR_DEFAULTS, gdv: 0 });
assert.equal(zeroGdv.grossYield, 0);
assert.ok(Number.isFinite(zeroGdv.grossYield));

const invalid = calcBrrr('not-a-number', { ...BRRR_DEFAULTS, monthlyRent: 'bad' });
assert.equal(invalid.offerPrice, 0);
assert.equal(invalid.annualRent, 0);

console.log('BRRR calculation checks passed.');
