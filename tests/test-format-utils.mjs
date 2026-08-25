import assert from 'node:assert/strict';
import { escapeHtml, formatCurrency, formatDate, formatNumber, formatPercentage, parseNumber } from '../format-utils.js';

assert.equal(parseNumber('£250,000.50'), 250000.5);
assert.equal(parseNumber('invalid', 7), 7);
assert.equal(formatCurrency(1234), '£1,234');
assert.equal(formatCurrency(12.5, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), '£12.50');
assert.equal(formatNumber(1.234, { maximumFractionDigits: 1 }), '1.2');
assert.equal(formatPercentage(5.55), '5.6%');
assert.equal(formatDate('2026-08-25T12:00:00Z', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }), '25 Aug 2026');
assert.equal(formatDate('invalid', undefined, 'Never'), 'Never');
assert.equal(escapeHtml(`<Home> & "quote" 'value'`), '&lt;Home&gt; &amp; &quot;quote&quot; &#039;value&#039;');

console.log('Shared formatting and parsing utility checks passed.');