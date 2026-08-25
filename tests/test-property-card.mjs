import assert from 'node:assert/strict';

class FakeElement {
  constructor() { this.className = ''; this.innerHTML = ''; }
}
globalThis.document = { createElement: () => new FakeElement() };

const { createPropertyCard } = await import('../property-card.js');
const calc = {
  purchasePrice: 200000, depositPercent: 25, depositAmount: 50000,
  mortgageRequired: 150000, totalPurchaseCostsExcludingDeposit: 12000,
  refurbishment: 8000, totalCashRequired: 70000
};
const formatters = {
  money: (value) => `£${value}`,
  number: String,
  escape: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
};

const active = createPropertyCard({ property: { title: '<Home>' }, calc, headerHtml: '<h3>Home</h3>', formatters });
const archived = createPropertyCard({ property: { title: 'Old Home' }, calc, archived: true, headerHtml: '<h3>Old Home</h3>', actionsHtml: '<button>Restore</button>', formatters });

for (const card of [active, archived]) {
  assert.match(card.innerHTML, /Purchase Price[\s\S]*Deposit[\s\S]*Mortgage[\s\S]*Purchase Costs/);
  assert.match(card.innerHTML, /Cash to Buy Property[\s\S]*\+ Refurbishment[\s\S]*Total Investment/);
  assert.match(card.innerHTML, /£62000[\s\S]*£8000[\s\S]*£70000/);
}
assert.match(active.className, /^property-card$/);
assert.match(active.innerHTML, /aria-label="Open &lt;Home> for editing"/);
assert.doesNotMatch(archived.innerHTML, /property-card-open/);
assert.equal(archived.className, 'property-card archived-card');

console.log('Shared property-card rendering tests passed.');