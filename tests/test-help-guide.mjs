import assert from 'node:assert/strict';
import fs from 'node:fs';

const guide = fs.readFileSync(new URL('../help-guide.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const forecast = fs.readFileSync(new URL('../forecast/index.html', import.meta.url), 'utf8');
const expenses = fs.readFileSync(new URL('../expenses/index.html', import.meta.url), 'utf8');
const appShell = fs.readFileSync(new URL('../app-shell.js', import.meta.url), 'utf8');
const serviceWorker = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

assert.match(guide, /spv-help-guide-seen/, 'Guide must remember that a first-time user has seen it');
assert.match(guide, /if \(!hasSeenGuide\(\)\).*openGuide/, 'Guide must open automatically for a new user');
assert.match(guide, /iPhone\|iPad\|iPod[\s\S]*Add to Home Screen/, 'Guide must include iPhone installation directions');
assert.match(guide, /Android[\s\S]*Install app/, 'Guide must include Android installation directions');
assert.match(guide, /Account & sync[\s\S]*Properties[\s\S]*Expenses[\s\S]*Forecast[\s\S]*More/, 'Guide must cover login, sync and all primary menu options');
assert.match(guide, /data-help-back[\s\S]*data-help-next/, 'Guide must provide step navigation');

for (const [name, page] of [['home', index], ['forecast', forecast], ['expenses', expenses]]) {
  assert.match(page, /help-guide\.js/, `${name} must load the shared Help Guide`);
}
assert.match(appShell, /data-help-guide[\s\S]*<strong>Help Guide<\/strong>[\s\S]*SPVHelpGuide\?\.bindTriggers\(dialog\)/, 'Shared App Menu must provide Help Guide access');
assert.match(serviceWorker, /'\.\/help-guide\.js'/, 'Help Guide must be available offline');

console.log('First-visit Help Guide checks passed.');
