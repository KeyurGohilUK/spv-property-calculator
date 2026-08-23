import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const forecast = fs.readFileSync(new URL('./forecast.html', import.meta.url), 'utf8');
const expenses = fs.readFileSync(new URL('./expenses.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const secondaryHeader = fs.readFileSync(new URL('./secondary-page-header.js', import.meta.url), 'utf8');

for (const [name, page] of [['home', index], ['forecast', forecast], ['expenses', expenses]]) {
  assert.match(page, /class="primary-app-nav"/, `${name} page is missing primary navigation`);
  assert.match(page, />Properties</, `${name} navigation is missing Properties`);
  assert.match(page, />Expenses</, `${name} navigation is missing Expenses`);
  assert.match(page, /<span>Expenses<\/span><small>Beta<\/small>/, `${name} navigation must label Expenses as Beta`);
  assert.match(page, />Forecast</, `${name} navigation is missing Forecast`);
  assert.match(page, /<span>Forecast<\/span><small>Beta<\/small>/, `${name} navigation must label Forecast as Beta`);
  assert.match(page, />More</, `${name} navigation is missing More`);
}

for (const [name, page] of [['forecast', forecast], ['expenses', expenses]]) {
  assert.match(page, /secondary-page-header\.js/, `${name} must load shared header controls`);
}
assert.match(secondaryHeader, /id="secondaryConnectionStatus"/, 'Shared header must include online status');
assert.match(secondaryHeader, /id="secondaryAccountBtn"/, 'Shared header must include Account');
assert.match(secondaryHeader, /id="secondaryInstallBtn"/, 'Shared header must include Install');
assert.doesNotMatch(secondaryHeader, /window\.location\.href = '\.\/\?dialog=(?:account|install)'/, 'Account and Install must not navigate away');
assert.match(secondaryHeader, /secondaryAccountBtn[\s\S]*secondaryAccountDialog[\s\S]*showModal/, 'Account must open a local popup');
assert.match(secondaryHeader, /secondaryInstallBtn[\s\S]*secondaryInstallDialog[\s\S]*showModal/, 'Install must open a local popup');
assert.match(secondaryHeader, /secondarySyncBtn[\s\S]*syncWorkspace/, 'Local Account popup must provide combined workspace sync');
assert.match(secondaryHeader, /secondaryUpdateBtn[\s\S]*handleUpdate/, 'Local Install popup must provide update handling');
assert.match(forecast, /supabase-config\.js[\s\S]*cloud\.js[\s\S]*secondary-page-header\.js/, 'Forecast must load local account dependencies');
assert.match(forecast, /<button class="primary-nav-item" type="button" data-more-menu/, 'Forecast More must be a local dialog button');
assert.match(expenses, /<button class="primary-nav-item" type="button" data-more-menu/, 'Expenses More must be a local dialog button');
assert.doesNotMatch(forecast, /href="\.\/\?menu=more"/, 'Forecast More must not navigate away');
assert.doesNotMatch(expenses, /href="\.\/\?menu=more"/, 'Expenses More must not navigate away');
assert.match(secondaryHeader, /secondaryMoreMenuDialog[\s\S]*showModal\(\)/, 'Secondary More must open a local popup');
assert.match(secondaryHeader, /class="install-dialog more-menu-dialog"/, 'Secondary App Menu must use Install dialog styling');
assert.match(index, /id="moreMenuDialog" class="install-dialog more-menu-dialog"/, 'Main App Menu must use Install dialog styling');
assert.match(app, /searchParams\.get\('view'\) === 'archive'[\s\S]*showArchive/, 'Archived Properties route must open the archive view');

assert.equal((index.match(/id="archiveBtn"/g) || []).length, 1, 'Archive action ID must be unique');
assert.match(index, /id="moreMenuDialog"/, 'More menu dialog missing');
assert.doesNotMatch(index, /<h3>More<\/h3>/, 'More popup must not repeat the word More');
assert.match(index, /<h3>App Menu<\/h3>/, 'App Menu title must remain in the popup header');
assert.match(index, /id="closeMoreMenuDialog" class="icon-btn more-menu-close"/, 'More popup close button class missing');
assert.match(styles, /\.more-menu-header[\s\S]*display: flex[\s\S]*justify-content: space-between/, 'App Menu title and close button must share an aligned header row');
assert.match(app, /moreMenuDialog.*getBoundingClientRect[\s\S]*clickedInside[\s\S]*dialog\.close/s, 'Backdrop click must close the App Menu');
assert.match(index, /href="\.\/expenses\.html"/, 'Home navigation must link to Expenses');
assert.match(forecast, /href="\.\/expenses\.html"/, 'Forecast navigation must link to Expenses');
assert.match(expenses, /class="primary-nav-item active" href="\.\/expenses\.html" aria-current="page"/, 'Expenses navigation must be active on its page');
assert.doesNotMatch(index, /Expense tracking is coming next|<span>Soon<\/span>|<small>Soon<\/small>/, 'Expenses must no longer be marked as coming soon');
assert.doesNotMatch(expenses, /aria-disabled="true"[^>]*Expenses/, 'Beta Expenses navigation must remain enabled');
for (const [name, page] of [['home', index], ['forecast', forecast], ['expenses', expenses]]) {
  assert.equal((page.match(/<small>Beta<\/small>/g) || []).length, 2, `${name} must show Beta only for Expenses and Forecast`);
}
assert.match(app, /moreNavBtn.*addEventListener/s, 'More menu event handler missing');
assert.doesNotMatch(index, /id="more(?:Sync|Account|Install)Btn"/, 'More menu must not duplicate header or account actions');
assert.match(index, /id="archiveBtn"/, 'Archived Properties must remain available under More');
assert.match(styles, /@media \(max-width: 700px\)[\s\S]*\.primary-app-nav[\s\S]*position: fixed/, 'Mobile fixed navigation styling missing');
assert.match(styles, /safe-bottom/, 'Navigation must respect device safe-area spacing');
assert.match(styles, /\.field input, \.field textarea, \.field select, \.expense-row input/, 'Dropdowns must share base input styling');
assert.match(styles, /\.field select \{[\s\S]*appearance: none[\s\S]*background-image:/, 'Dropdowns must use the shared custom arrow treatment');
assert.match(styles, /select:focus-visible/, 'Dropdowns must provide the shared keyboard focus style');
assert.match(styles, /\.field select:disabled/, 'Dropdowns must provide a disabled state');

console.log('Primary navigation structure checks passed.');
