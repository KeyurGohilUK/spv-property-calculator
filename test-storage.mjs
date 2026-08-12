import assert from 'node:assert/strict';

const backing = new Map();
globalThis.localStorage = {
  getItem: (key) => backing.has(key) ? backing.get(key) : null,
  setItem: (key, value) => backing.set(key, String(value)),
  removeItem: (key) => backing.delete(key),
  clear: () => backing.clear()
};

const { getProperties, getProperty, saveProperty, deleteProperty, duplicateProperty } = await import('./storage.js');

const saved = saveProperty({ title: 'Test Property', purchasePrice: 200000, depositPercent: 25 });
assert.ok(saved.id);
assert.equal(getProperties().length, 1);
assert.equal(getProperty(saved.id).title, 'Test Property');

const updated = saveProperty({ ...saved, title: 'Updated Property' });
assert.equal(updated.id, saved.id);
assert.equal(getProperty(saved.id).title, 'Updated Property');

const copy = duplicateProperty(saved.id);
assert.ok(copy.id !== saved.id);
assert.equal(getProperties().length, 2);
assert.match(copy.title, /\(Copy\)$/);

assert.equal(deleteProperty(saved.id), true);
assert.equal(getProperties().length, 1);
console.log('All storage tests passed.');
