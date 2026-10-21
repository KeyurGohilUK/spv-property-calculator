import assert from 'node:assert/strict';
import {
  getOpportunityProperties,
  getPortfolioProperties,
  normalizePurchaseStage,
  PURCHASE_STAGES
} from '../src/features/properties/purchase-lifecycle.js';

const records = [
  { id: 'new' },
  { id: 'stc', purchaseStage: 'under_offer' },
  { id: 'owned', purchaseStage: 'completed' },
  { id: 'archived', purchaseStage: 'completed', deletedAt: '2026-10-20T12:00:00Z' }
];

assert.equal(normalizePurchaseStage(undefined), 'opportunity');
assert.equal(normalizePurchaseStage('invalid'), 'opportunity');
assert.equal(PURCHASE_STAGES.under_offer, 'Under offer · Sold STC');
assert.deepEqual(getOpportunityProperties(records).map(({ id }) => id), ['new', 'stc']);
assert.deepEqual(getPortfolioProperties(records).map(({ id }) => id), ['owned']);
assert.deepEqual(getPortfolioProperties([]), []);

console.log('Purchase lifecycle tests passed.');
