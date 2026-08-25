import assert from 'node:assert/strict';
import { clearFieldValidation, setFieldValidation } from '../validation.js';

const attributes = new Map([['aria-describedby', 'fieldHelp']]);
const input = {
  validityMessage: '',
  getAttribute: (name) => attributes.get(name) || null,
  setAttribute: (name, value) => attributes.set(name, value),
  removeAttribute: (name) => attributes.delete(name),
  setCustomValidity(message) { this.validityMessage = message; }
};
const classes = new Set(['hidden']);
const error = {
  id: 'fieldError',
  textContent: 'Enter a valid value.',
  classList: { toggle: (name, force) => force ? classes.add(name) : classes.delete(name) }
};

setFieldValidation(input, error, { invalid: true });
assert.equal(attributes.get('aria-invalid'), 'true');
assert.equal(attributes.get('aria-describedby'), 'fieldHelp fieldError');
assert.equal(input.validityMessage, 'Enter a valid value.');
assert.equal(classes.has('hidden'), false);

clearFieldValidation(input, error);
assert.equal(attributes.has('aria-invalid'), false);
assert.equal(attributes.get('aria-describedby'), 'fieldHelp fieldError');
assert.equal(input.validityMessage, '');
assert.equal(classes.has('hidden'), true);

setFieldValidation(input, error, { invalid: true, message: 'Updated error.' });
assert.equal(error.textContent, 'Updated error.');
assert.equal(input.validityMessage, 'Updated error.');
assert.equal(attributes.get('aria-describedby'), 'fieldHelp fieldError');

console.log('Accessible field validation checks passed.');
