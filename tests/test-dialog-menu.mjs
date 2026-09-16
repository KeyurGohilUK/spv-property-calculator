import assert from 'node:assert/strict';
import fs from 'node:fs';

const dialogHelper = fs.readFileSync(new URL('../src/components/dialog-helper.js', import.meta.url), 'utf8');
const appShell = fs.readFileSync(new URL('../src/app/app-shell.js', import.meta.url), 'utf8');
const policyAcceptance = fs.readFileSync(new URL('../src/services/policy-acceptance.js', import.meta.url), 'utf8');
const dialogStyles = fs.readFileSync(new URL('../styles/dialogs.css', import.meta.url), 'utf8');

assert.match(dialogHelper, /dialog\.setAttribute\('tabindex', '-1'\)/, 'Shared dialogs must be programmatically focusable without selecting a control');
assert.match(dialogHelper, /setAttribute\('autofocus', ''\)/, 'Shared dialogs must direct native modal focus to the dialog container');
assert.match(dialogHelper, /focusFirst = \(\) => dialog\.focus\(\{ preventScroll: true \}\)/, 'Shared dialogs must focus the dialog container when opened');
assert.match(dialogHelper, /focusFirst\(\)[\s\S]*requestAnimationFrame\(focusFirst\)/, 'Shared dialogs must re-apply neutral container focus after native dialog focus handling');
assert.doesNotMatch(dialogHelper, /initialFocus|querySelectorAll\('\[autofocus\]/, 'Shared dialog helper must not preselect an input, button or close control');
assert.doesNotMatch(appShell, /BRRR Calculator|href="\.\/brrr\/"/, 'App Menu must not duplicate the BRRR calculator already available inside Forecast');
assert.match(policyAcceptance, /tabindex="-1" autofocus[\s\S]*requestAnimationFrame\(focusDialog\)/, 'Policy acceptance dialog must use neutral container focus too');
assert.match(dialogStyles, /\.install-dialog:focus\s*\{\s*outline:\s*none;/, 'Neutral dialog-container focus must not render as a selected control');

console.log('Dialog focus and App Menu checks passed.');
