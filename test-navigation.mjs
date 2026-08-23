import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const forecast = fs.readFileSync(new URL('./forecast.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

for (const [name, page] of [['home', index], ['forecast', forecast]]) {
  assert.match(page, /class="primary-app-nav"/, `${name} page is missing primary navigation`);
  assert.match(page, />Properties</, `${name} navigation is missing Properties`);
  assert.match(page, />Expenses</, `${name} navigation is missing Expenses`);
  assert.match(page, />Forecast</, `${name} navigation is missing Forecast`);
  assert.match(page, />More</, `${name} navigation is missing More`);
}

assert.equal((index.match(/id="archiveBtn"/g) || []).length, 1, 'Archive action ID must be unique');
assert.match(index, /id="moreMenuDialog"/, 'More menu dialog missing');
assert.match(index, /aria-disabled="true"[^>]*title="Expense tracking is coming next"/, 'Expenses placeholder must be visibly disabled');
assert.match(app, /moreNavBtn.*addEventListener/s, 'More menu event handler missing');
assert.doesNotMatch(index, /id="more(?:Sync|Account|Install)Btn"/, 'More menu must not duplicate header or account actions');
assert.match(index, /id="archiveBtn"/, 'Archived Properties must remain available under More');
assert.match(styles, /@media \(max-width: 700px\)[\s\S]*\.primary-app-nav[\s\S]*position: fixed/, 'Mobile fixed navigation styling missing');
assert.match(styles, /safe-bottom/, 'Navigation must respect device safe-area spacing');

console.log('Primary navigation structure checks passed.');
