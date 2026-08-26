import assert from 'node:assert/strict';
import fs from 'node:fs';

const pages = [
  ['Properties', 'index.html', 'SPV Property Calculator'],
  ['Expenses', 'expenses/index.html', 'Expense Tracker'],
  ['Forecast', 'forecast/index.html', 'Property Forecast'],
  ['Manage Users', 'admin/users/index.html', 'Manage Users']
];

for (const [name, path, title] of pages) {
  const html = fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const headings = [...html.matchAll(/<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/gi)];
  assert.equal(headings.length, 1, `${name} must contain exactly one h1`);
  assert.equal(headings[0][1].replace(/<[^>]+>/g, '').trim(), title, `${name} h1 must describe the page`);
}

const heroStyles = fs.readFileSync(new URL('../styles/app-shell-core.css', import.meta.url), 'utf8');
assert.match(heroStyles, /\.hero-card h1, \.hero-card h2 \{ font-size: 28px;/, 'h1 must retain the existing hero heading presentation');

console.log('Page heading hierarchy checks passed.');
