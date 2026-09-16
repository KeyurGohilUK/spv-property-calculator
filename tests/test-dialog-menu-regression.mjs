import assert from 'node:assert/strict';
import fs from 'node:fs';

const appShell = fs.readFileSync(new URL('../src/app/app-shell.js', import.meta.url), 'utf8');
const dialogHelper = fs.readFileSync(new URL('../src/components/dialog-helper.js', import.meta.url), 'utf8');
const policyAcceptance = fs.readFileSync(new URL('../src/services/policy-acceptance.js', import.meta.url), 'utf8');
const dialogStyles = fs.readFileSync(new URL('../styles/dialogs.css', import.meta.url), 'utf8');

assert.doesNotMatch(
  appShell,
  /BRRR Calculator|href="\.\/brrr\/"/,
  'App Menu must not duplicate the BRRR calculator that is already available from Forecast.'
);

assert.match(
  dialogHelper,
  /setAttribute\('autofocus', ''\)/,
  'Shared dialogs must autofocus the dialog container rather than the first close/action control.'
);
assert.match(
  dialogHelper,
  /focusDialog\(\)[\s\S]*requestAnimationFrame\(focusDialog\)/,
  'Shared dialogs must restore container focus after the browser native dialog focus step.'
);
assert.match(
  policyAcceptance,
  /tabindex="-1" autofocus[\s\S]*requestAnimationFrame\(focusDialog\)/,
  'The policy dialog must follow the same neutral initial-focus behaviour.'
);
assert.match(
  dialogStyles,
  /\.install-dialog:focus\s*\{\s*outline:\s*none;/,
  'Focusing the dialog container must not draw a selected-control style.'
);

console.log('Dialog focus and App Menu regression checks passed.');
