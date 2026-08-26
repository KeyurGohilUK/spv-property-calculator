import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const imports = [...manifest.matchAll(/@import url\('\.\/(styles\/[^']+)'\);/g)].map((match) => match[1]);
const expected = [
  'styles/tokens.css', 'styles/base.css', 'styles/app-shell-core.css',
  'styles/features/properties.css', 'styles/forms.css', 'styles/features/summary.css',
  'styles/dialogs.css', 'styles/features/archive.css', 'styles/app-shell-home.css',
  'styles/features/editor.css', 'styles/dialogs-updates.css', 'styles/features/statuses.css',
  'styles/app-shell-navigation.css', 'styles/legal.css'
];

assert.deepEqual(imports, expected, 'Stylesheet manifest order must preserve the established cascade');
for (const path of expected) {
  const source = fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  assert.ok(source.trim(), `${path} must not be empty`);
}
assert.match(fs.readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8'), /^:root[\s\S]*html\[data-theme="dark"\]/);
assert.match(fs.readFileSync(new URL('../styles/forms.css', import.meta.url), 'utf8'), /\.field[\s\S]*\.expense-row/);
assert.match(fs.readFileSync(new URL('../styles/dialogs.css', import.meta.url), 'utf8'), /\.install-dialog/);
assert.match(fs.readFileSync(new URL('../styles/app-shell-navigation.css', import.meta.url), 'utf8'), /\.primary-app-nav/);
assert.match(fs.readFileSync(new URL('../styles/features/properties.css', import.meta.url), 'utf8'), /\.property-card/);

for (const canonicalName of ['expenses.css', 'forecast.css', 'forecast-advanced.css', 'users.css']) {
  const canonicalPath = `styles/features/${canonicalName}`;
  assert.ok(fs.readFileSync(new URL(`../${canonicalPath}`, import.meta.url), 'utf8').trim(), `${canonicalPath} must not be empty`);
}

console.log('Split stylesheet architecture checks passed.');
