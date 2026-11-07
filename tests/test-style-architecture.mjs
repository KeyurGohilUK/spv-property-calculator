import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const imports = [...manifest.matchAll(/@import url\('\.\/(styles\/[^']+)'\);/g)].map((match) => match[1]);
const expected = [
  'styles/tokens.css', 'styles/base.css', 'styles/app-shell-core.css', 'styles/components/chat-thread.css',
  'styles/components/linked-content.css', 'styles/components/rich-textarea.css', 'styles/features/properties.css', 'styles/forms.css', 'styles/components/file-upload.css', 'styles/features/summary.css',
  'styles/dialogs.css', 'styles/features/archive.css', 'styles/app-shell-home.css',
  'styles/features/editor.css', 'styles/features/price-history.css', 'styles/dialogs-updates.css', 'styles/features/statuses.css',
  'styles/app-shell-navigation.css', 'styles/legal.css', 'styles/features/tasks.css', 'styles/components/interactive-card-hover.css', 'styles/components/icon-action-feedback.css', 'styles/components/action-button-feedback.css'
];

assert.deepEqual(imports, expected, 'Stylesheet manifest order must preserve the established cascade');
for (const path of expected) {
  const source = fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  assert.ok(source.trim(), `${path} must not be empty`);
}
assert.match(fs.readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8'), /^:root[\s\S]*html\[data-theme="dark"\]/);
assert.match(fs.readFileSync(new URL('../styles/forms.css', import.meta.url), 'utf8'), /\.field[\s\S]*\.expense-row/);
assert.match(fs.readFileSync(new URL('../styles/dialogs.css', import.meta.url), 'utf8'), /\.app-dialog/);
assert.match(fs.readFileSync(new URL('../styles/app-shell-navigation.css', import.meta.url), 'utf8'), /\.primary-app-nav/);
const shellCore = fs.readFileSync(new URL('../styles/app-shell-core.css', import.meta.url), 'utf8');
const dialogStyles = fs.readFileSync(new URL('../styles/dialogs.css', import.meta.url), 'utf8');
const navigationStyles = fs.readFileSync(new URL('../styles/app-shell-navigation.css', import.meta.url), 'utf8');
assert.match(shellCore, /\.main-shell \{ max-width: 1328px;/, 'Shared pages use the expanded desktop content width');
assert.match(dialogStyles, /\.main-shell \{ padding-inline: 8px; \}/, 'Mobile page gutters stay visible while remaining reduced');
assert.match(navigationStyles, /calc\(\(100vw - 1328px\) \/ 2 \+ 16px\)/, 'Desktop navigation aligns with the expanded page width');
const companyStyles = fs.readFileSync(new URL('../styles/features/company.css', import.meta.url), 'utf8');
assert.match(companyStyles, /\.company-tab-panel:not\(\[hidden\]\) > \.company-section \{ width: 100%; max-width: 100%; margin-inline: 0; box-sizing: border-box; \}/, 'Company tab sections align to the shared page gutter');
assert.match(fs.readFileSync(new URL('../styles/features/properties.css', import.meta.url), 'utf8'), /\.property-card/);
assert.match(fs.readFileSync(new URL('../styles/components/linked-content.css', import.meta.url), 'utf8'), /\.inline-text-link[\s\S]*\.property-map-link/);
assert.match(fs.readFileSync(new URL('../styles/components/rich-textarea.css', import.meta.url), 'utf8'), /\.rich-textbox-toolbar[\s\S]*\.rich-textbox-editor/);

for (const canonicalName of ['expenses.css', 'forecast.css', 'forecast-advanced.css', 'users.css', 'tasks.css']) {
  const canonicalPath = `styles/features/${canonicalName}`;
  assert.ok(fs.readFileSync(new URL(`../${canonicalPath}`, import.meta.url), 'utf8').trim(), `${canonicalPath} must not be empty`);
}

console.log('Split stylesheet architecture checks passed.');
