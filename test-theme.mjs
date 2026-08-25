import assert from 'node:assert/strict';
import fs from 'node:fs';

const theme = fs.readFileSync(new URL('./theme.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const forecast = fs.readFileSync(new URL('./forecast.html', import.meta.url), 'utf8');
const expenses = fs.readFileSync(new URL('./expenses.html', import.meta.url), 'utf8');
const appShell = fs.readFileSync(new URL('./app-shell.js', import.meta.url), 'utf8');
const serviceWorker = fs.readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8');

assert.match(theme, /DEFAULT_THEME = 'light'/, 'First launch must default to Light theme');
assert.match(theme, /localStorage\.getItem\(STORAGE_KEY\)/, 'Saved theme must be restored');
assert.match(theme, /localStorage\.setItem\(STORAGE_KEY, selectedTheme\)/, 'Theme choice must be persisted');
assert.match(theme, /document\.documentElement\.dataset\.theme = selectedTheme/, 'Theme must be applied to the document');
assert.match(styles, /html\[data-theme="dark"\]/, 'Dark tokens must require an explicit app theme');
assert.doesNotMatch(styles, /@media \(prefers-color-scheme: dark\)/, 'Device Dark Mode must not override the app preference');
assert.match(styles, /\.property-cost-breakdown \.investment-total strong \{[^}]*color: var\(--brand\)/, 'Property total must use the selected theme colour');
assert.match(styles, /\.editor-save-icon\.is-saved \{[^}]*var\(--brand\)/, 'Saved property action must use the selected theme colour');

for (const [name, page] of [['home', index], ['forecast', forecast], ['expenses', expenses]]) {
  assert.match(page, /<script src="\.\/theme\.js"><\/script>[\s\S]*<link rel="stylesheet" href="\.\/styles\.css">/, `${name} must apply the theme before loading styles`);
}
assert.match(appShell, /data-theme-toggle[\s\S]*SPVTheme\?\.bindThemeControls\(dialog\)/, 'Shared App Menu must include and bind the theme switch');
assert.match(serviceWorker, /'\.\/theme\.js'/, 'Theme support must work offline');

console.log('Theme preference checks passed.');
