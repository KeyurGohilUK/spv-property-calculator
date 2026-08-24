import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
assert.doesNotMatch(index, /Works offline, with a shared Supabase workspace for your small team\./, 'Home introduction must not include the removed workspace sentence');
assert.match(index, /Archived properties are hidden from the main list and can be restored at any time\./, 'Archive guidance must remain clear and user-focused');
assert.doesNotMatch(index, /remain stored locally and in Supabase|Any signed-in user can restore them/, 'Archive guidance must not expose backend details');
assert.match(index, /class="property-hero-actions"[\s\S]*id="propertySyncStatus" class="sync-status"[\s\S]*id="newPropertyBtn" class="primary-btn"/, 'Properties hero must use the shared sync-status component');
const forecast = fs.readFileSync(new URL('./forecast.html', import.meta.url), 'utf8');
const expenses = fs.readFileSync(new URL('./expenses.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const secondaryHeader = fs.readFileSync(new URL('./secondary-page-header.js', import.meta.url), 'utf8');
const installComponent = fs.readFileSync(new URL('./install-component.js', import.meta.url), 'utf8');
const syncStatus = fs.readFileSync(new URL('./sync-status.js', import.meta.url), 'utf8');
assert.doesNotMatch(expenses, /Total recorded|Company expenses|Property expenses|expense-summary-grid/, 'Expense overview counters must remain removed');
assert.doesNotMatch(forecast, /forecast-topbar|forecast-back|Investment forecasting/, 'Forecast must not duplicate the main navigation with an upper back bar');
assert.doesNotMatch(index, /id="archiveBackBtn"|Shared archive/, 'Archived Properties must not duplicate the main navigation with an upper back bar');
assert.match(syncStatus, /export function renderSyncStatus\(element, message, state = ''\)[\s\S]*state === 'error'[\s\S]*state === 'synced'/, 'Shared sync-status component must apply consistent states');

assert.match(app, /import \{ renderSyncStatus \} from '.\/sync-status\.js';[\s\S]*function renderPropertySyncStatus\(isWarning = false\)[\s\S]*Offline · changes will sync later[\s\S]*renderSyncStatus\(status, message, tone\)/, 'Properties must use the shared neutral offline sync status');
assert.match(styles, /\.property-hero-actions \{[^}]*display: flex;[^}]*justify-content: flex-end;[^}]*flex-wrap: wrap;/, 'Property hero actions must match expense hero alignment');
assert.match(styles, /\.hero-card \{[\s\S]*radial-gradient\(circle at 100% 0%[\s\S]*var\(--surface\)/, 'Every page header card must share the raised corner treatment');
assert.doesNotMatch(styles, /#homeView > \.hero-card/, 'Page header corner treatment must not be limited to Properties');
assert.match(styles, /\.sync-status \{[^}]*color: var\(--muted\)[^}]*text-align: right; \}[\s\S]*\.sync-status\.error \{ color: var\(--danger\); \}[\s\S]*\.sync-status\.synced \{ color: var\(--brand\); \}/, 'Shared sync-status styling is missing');
assert.match(styles, /@media \(max-width: 620px\)[\s\S]*\.property-hero-actions \{[^}]*grid-template-columns: 1fr;[^}]*width: 100%; \}/, 'Property hero actions must stack on mobile');

for (const [name, page] of [['home', index], ['forecast', forecast], ['expenses', expenses]]) {
  assert.match(page, /class="primary-app-nav"/, `${name} page is missing primary navigation`);
  assert.match(page, />Properties</, `${name} navigation is missing Properties`);
  assert.match(page, />Expenses</, `${name} navigation is missing Expenses`);
  assert.doesNotMatch(page, /<span>Expenses<\/span><small>Beta<\/small>/, `${name} navigation must not label Expenses as Beta`);
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
assert.match(app, /setupInstallComponent\([\s\S]*button: \$\('installBtn'\)/, 'Home Install control must use the shared component');
assert.match(secondaryHeader, /setupInstallComponent\(\{ button: \$\('secondaryInstallBtn'\) \}\)/, 'Secondary Install controls must use the shared component');
assert.match(installComponent, /setupUpdateNotifier\(button, APP_VERSION\)/, 'Shared Install component must provide update notifications');
assert.match(styles, /\.header-icon-control\.update-available[\s\S]*update-icon-pulse[\s\S]*::before/, 'Update available indicator styling is missing');
assert.doesNotMatch(secondaryHeader, /window\.location\.href = '\.\/\?dialog=(?:account|install)'/, 'Account and Install must not navigate away');
assert.match(secondaryHeader, /secondaryAccountBtn[\s\S]*secondaryAccountDialog[\s\S]*showModal/, 'Account must open a local popup');
assert.doesNotMatch(secondaryHeader, /secondaryInstallDialog|secondaryNativeInstallBtn|secondaryUpdateBtn/, 'Secondary pages must not keep a duplicate Install popup');
assert.match(installComponent, /id="installDialog"[\s\S]*id="nativeInstallBtn"[\s\S]*id="downloadUpdatesBtn"/, 'Shared Install popup is incomplete');
assert.match(secondaryHeader, /secondarySyncBtn[\s\S]*syncWorkspace/, 'Local Account popup must provide combined workspace sync');
assert.match(installComponent, /async function downloadUpdates[\s\S]*APP_UPDATE_ASSETS/, 'Shared Install popup must provide update handling');
assert.match(forecast, /supabase-config\.js[\s\S]*cloud\.js[\s\S]*secondary-page-header\.js/, 'Forecast must load local account dependencies');
assert.match(forecast, /<button class="primary-nav-item" type="button" data-more-menu/, 'Forecast More must be a local dialog button');
assert.match(expenses, /<button class="primary-nav-item" type="button" data-more-menu/, 'Expenses More must be a local dialog button');
assert.doesNotMatch(forecast, /href="\.\/\?menu=more"/, 'Forecast More must not navigate away');
assert.doesNotMatch(expenses, /href="\.\/\?menu=more"/, 'Expenses More must not navigate away');
assert.match(secondaryHeader, /secondaryMoreMenuDialog[\s\S]*showModal\(\)/, 'Secondary More must open a local popup');
assert.match(index, /more-menu-list[\s\S]*Archived Properties[\s\S]*Manage Users[\s\S]*Help Guide[\s\S]*Theme/, 'Home App Menu items must be ordered by priority');
assert.match(secondaryHeader, /more-menu-list[\s\S]*Archived Properties[\s\S]*Manage Users[\s\S]*Help Guide[\s\S]*Theme/, 'Secondary App Menu items must match the priority order');
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
assert.doesNotMatch(expenses, /aria-disabled="true"[^>]*Expenses/, 'Expenses navigation must remain enabled');
for (const [name, page] of [['home', index], ['forecast', forecast], ['expenses', expenses]]) {
  assert.equal((page.match(/<small>Beta<\/small>/g) || []).length, 1, `${name} must show Beta only for Forecast`);
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
assert.match(styles, /\.property-cost-breakdown > div \{[^}]*grid-template-columns: minmax\(0, 1fr\) max-content;/, 'Property card cost rows must reserve the full remaining width before the amount');
assert.match(styles, /\.property-cost-breakdown > div strong \{[^}]*justify-self: end;[^}]*text-align: right;/, 'Property card totals must anchor to the far-right edge');
assert.match(styles, /\.property-list \{[^}]*align-items: start;/, 'Property cards must keep their content height instead of stretching to the tallest card');
assert.match(app, /property-card-more[\s\S]*data-action="duplicate"[\s\S]*data-action="archive"/, 'Secondary property actions must use the overflow menu');
assert.match(styles, /\.property-card:not\(\.archived-card\) \.property-card-header \{[^}]*min-height:/, 'Property card headers must keep financial rows aligned');
assert.match(styles, /\.property-cost-breakdown[\s\S]*\.investment-total[^{]*\{[^}]*background:/, 'Total Investment must use the shared footer treatment');
assert.match(styles, /\.property-card h3 \{[^}]*-webkit-line-clamp: 2;/, 'Long property titles must be limited to two lines');
assert.match(styles, /\.property-stats strong \{[^}]*text-align: right;/, 'Property amounts must align for comparison');
assert.match(styles, /\.property-viewing-date\.viewed \{[^}]*var\(--positive\)/, 'Viewed properties must use a distinct positive status');
assert.match(styles, /dialog \{[\s\S]*scrollbar-width: thin[\s\S]*scrollbar-color:/, 'Every popup must use a thin Firefox scrollbar');
assert.match(styles, /dialog::\-webkit-scrollbar \{[\s\S]*width: 7px/, 'Every popup must use a thin WebKit scrollbar');
assert.match(styles, /dialog::\-webkit-scrollbar-thumb[\s\S]*var\(--brand\)/, 'Popup scrollbar thumb must use app theme colours');

console.log('Primary navigation structure checks passed.');
