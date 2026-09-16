import assert from 'node:assert/strict';
import fs from 'node:fs';

const dialogHelper = fs.readFileSync(new URL('../src/components/dialog-helper.js', import.meta.url), 'utf8');
const appShell = fs.readFileSync(new URL('../src/app/app-shell.js', import.meta.url), 'utf8');

assert.match(dialogHelper, /dialog\.setAttribute\('tabindex', '-1'\)/, 'Shared dialogs must be programmatically focusable without selecting a control');
assert.match(dialogHelper, /focusFirst = \(\) => dialog\.focus\(\{ preventScroll: true \}\)/, 'Shared dialogs must focus the dialog container when opened');
assert.doesNotMatch(dialogHelper, /initialFocus|querySelectorAll\('\[autofocus\]/, 'Shared dialog helper must not preselect an input, button or close control');
assert.doesNotMatch(appShell, /BRRR Calculator|href="\.\/brrr\/"/, 'App Menu must not duplicate the BRRR calculator already available inside Forecast');

console.log('Dialog focus and App Menu checks passed.');
