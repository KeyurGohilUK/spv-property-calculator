import assert from 'node:assert/strict';
import { isNewerVersion } from '../src/components/update-notifier.js';

assert.equal(isNewerVersion('1.21.2', '1.21.1'), true);
assert.equal(isNewerVersion('2.0.0', '1.99.99'), true);
assert.equal(isNewerVersion('1.21.1', '1.21.1'), false);
assert.equal(isNewerVersion('1.20.9', '1.21.1'), false);
assert.equal(isNewerVersion('', '1.21.1'), false);

console.log('Update notifier version checks passed.');
