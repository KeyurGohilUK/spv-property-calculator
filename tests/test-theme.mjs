import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readStyles } from './test-style-source.mjs';

const theme = fs.readFileSync(new URL('../src/components/theme.js', import.meta.url), 'utf8');
const styles = readStyles();
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const forecast = fs.readFileSync(new URL('../forecast/index.html', import.meta.url), 'utf8');
const expenses = fs.readFileSync(new URL('../expenses/index.html', import.meta.url), 'utf8');
const appShell = fs.readFileSync(new URL('../src/app/app-shell.js', import.meta.url), 'utf8');
const appAssets = JSON.parse(fs.readFileSync(new URL('../app-assets.json', import.meta.url), 'utf8')).assets;

assert.match(theme, /DEFAULT_THEME = 'light'/, 'First launch must default to Light theme');
assert.match(theme, /localStorage\.getItem\(STORAGE_KEY\)/, 'Saved theme must be restored');
assert.match(theme, /localStorage\.setItem\(STORAGE_KEY, selectedTheme\)/, 'Theme choice must be persisted');
assert.match(theme, /document\.documentElement\.dataset\.theme = selectedTheme/, 'Theme must be applied to the document');
assert.match(styles, /html\[data-theme="dark"\]/, 'Dark tokens must require an explicit app theme');
assert.doesNotMatch(styles, /@media \(prefers-color-scheme: dark\)/, 'Device Dark Mode must not override the app preference');
assert.match(styles, /\.property-cost-breakdown \.investment-total strong \{[^}]*color: var\(--brand\)/, 'Property total must use the selected theme colour');
assert.match(styles, /\.editor-save-icon\.is-saved \{[^}]*var\(--brand\)/, 'Saved property action must use the selected theme colour');

for (const [name, page] of [['home', index], ['forecast', forecast], ['expenses', expenses]]) {
  assert.match(page, /<script src="\.\/src\/components\/theme\.js"><\/script>[\s\S]*<link rel="stylesheet" href="\.\/styles\.css">/, `${name} must apply the canonical theme component before loading styles`);
}
assert.match(appShell, /data-theme-toggle[\s\S]*SPVTheme\?\.bindThemeControls\(dialog\)/, 'Shared App Menu must include and bind the theme switch');
assert.ok(appAssets.includes('./src/components/theme.js') && appAssets.includes('./theme.js'), 'Current and compatibility Theme scripts must work offline');

console.log('Theme preference checks passed.');
