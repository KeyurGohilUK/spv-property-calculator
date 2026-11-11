import assert from 'node:assert/strict';
import fs from 'node:fs';

const dialogHelper = fs.readFileSync(new URL('../src/components/dialog-helper.js', import.meta.url), 'utf8');
const appShell = fs.readFileSync(new URL('../src/app/app-shell.js', import.meta.url), 'utf8');
const policyAcceptance = fs.readFileSync(new URL('../src/services/policy-acceptance.js', import.meta.url), 'utf8');
const companyPage = fs.readFileSync(new URL('../company/details.html', import.meta.url), 'utf8');
const expensesPage = fs.readFileSync(new URL('../expenses/index.html', import.meta.url), 'utf8');
const tasksPage = fs.readFileSync(new URL('../tasks/index.html', import.meta.url), 'utf8');
const accountDialog = fs.readFileSync(new URL('../src/components/secondary-page-header.js', import.meta.url), 'utf8');
const helpGuide = fs.readFileSync(new URL('../src/components/help-guide.js', import.meta.url), 'utf8');
const dialogStyles = fs.readFileSync(new URL('../styles/dialogs.css', import.meta.url), 'utf8');

assert.match(dialogHelper, /dialog\.setAttribute\('tabindex', '-1'\)/, 'Shared dialogs must be programmatically focusable without selecting a control');
assert.match(dialogHelper, /dialog\.classList\.add\('app-dialog'\)/, 'Every controlled dialog must receive the shared app dialog class');
assert.match(dialogHelper, /setAttribute\('autofocus', ''\)/, 'Shared dialogs must direct native modal focus to the dialog container');
assert.match(dialogHelper, /focusFirst = \(\) => dialog\.focus\(\{ preventScroll: true \}\)/, 'Shared dialogs must focus the dialog container when opened');
assert.match(dialogHelper, /focusFirst\(\)[\s\S]*requestAnimationFrame\(focusFirst\)/, 'Shared dialogs must re-apply neutral container focus after native dialog focus handling');
assert.doesNotMatch(dialogHelper, /initialFocus|querySelectorAll\('\[autofocus\]/, 'Shared dialog helper must not preselect an input, button or close control');
assert.doesNotMatch(appShell, /BRRR Calculator|href="\.\/brrr\/"/, 'App Menu must not duplicate the BRRR calculator already available inside Forecast');
assert.match(policyAcceptance, /setupDialog\(dialog, \{\s*preventCancel: true,\s*closeOnBackdrop: false,?\s*\}\)[\s\S]*dialogController\.open\(document\.activeElement\)/, 'Policy acceptance must use the shared controller while blocking dismissal');
assert.doesNotMatch(policyAcceptance, /\.showModal\(/, 'Policy acceptance must not bypass the shared dialog controller');
assert.match(dialogStyles, /\.app-dialog:focus\s*\{\s*outline:\s*none;/, 'Neutral dialog-container focus must not render as a selected control');
assert.match(dialogStyles, /\.dialog-actions\s*\{[\s\S]*justify-content:\s*flex-end/, 'Dialog actions must align to the right');
assert.match(dialogStyles, /\.dialog-actions > \.primary-btn,[\s\S]*\.dialog-actions > \.secondary-btn\s*\{[\s\S]*width:\s*160px/, 'Dialog primary and secondary actions must share a standard width');
assert.match(dialogStyles, /\.app-dialog input\[type="date"\][\s\S]*min-inline-size:\s*0[\s\S]*max-inline-size:\s*100%/, 'Date controls must shrink within dialog columns');
assert.match(companyPage, /class="dialog-actions company-form-actions"/, 'Company dialogs must use shared action styling');
assert.match(expensesPage, /class="dialog-actions expense-form-actions"/, 'Expense dialogs must use shared action styling');
assert.match(tasksPage, /class="dialog-actions task-form-actions"[\s\S]*class="dialog-actions template-dialog-actions"/, 'Task dialogs must use shared action styling');
assert.match(tasksPage, /class="dialog-actions suggestion-footer"/, 'Suggestion dialog actions must use shared action styling');
assert.match(accountDialog, /class="auth-actions dialog-actions"/, 'Signed-in account dialogs must use shared action styling');
assert.match(helpGuide, /class="dialog-actions help-guide-actions"/, 'Help guide actions must use shared dialog styling');
assert.match(policyAcceptance, /class="dialog-actions policy-acceptance-actions"/, 'Policy dialog actions must use shared styling');

console.log('Dialog focus and App Menu checks passed.');
