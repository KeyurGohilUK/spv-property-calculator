import assert from 'node:assert/strict';
import { createPriceHistoryEntry, normalizePriceHistory } from '../src/features/properties/price-history.js';

const offer = createPriceHistoryEntry({
  id: 'offer-1', type: 'offer', price: '240000', date: '2026-10-12', note: 'Initial offer'
});
assert.deepEqual(offer, {
  id: 'offer-1', type: 'offer', price: 240000, date: '2026-10-12', note: 'Initial offer'
});
assert.equal(createPriceHistoryEntry({
  type: 'counteroffer', price: '245000', date: '2026-10-13'
}).type, 'counteroffer');
assert.throws(() => createPriceHistoryEntry({ type: 'other', price: 100, date: '2026-10-12' }));
assert.throws(() => createPriceHistoryEntry({ type: 'offer', price: 0, date: '2026-10-12' }));
assert.throws(() => createPriceHistoryEntry({ type: 'offer', price: 100, date: '2026-02-30' }));
assert.equal(normalizePriceHistory([offer, { type: 'other' }]).length, 1);
console.log('Price history tests passed.');
