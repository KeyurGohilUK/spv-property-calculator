import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const workerSource = fs.readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const release = JSON.parse(fs.readFileSync(new URL('./release.json', import.meta.url), 'utf8'));

const appVersion = appSource.match(/const APP_VERSION = '([^']+)'/)?.[1];
const cacheVersion = workerSource.match(/CACHE_NAME = 'spv-property-calculator-v([0-9]+\.[0-9]+\.[0-9]+)-/)?.[1];

assert.ok(appVersion, 'APP_VERSION was not found in app.js');
assert.ok(cacheVersion, 'Semantic cache version was not found in service-worker.js');
assert.equal(release.version, appVersion, 'release.json and APP_VERSION must match');
assert.equal(cacheVersion, appVersion, 'Service-worker cache version and APP_VERSION must match');
assert.match(indexSource, new RegExp(`Version ${appVersion.replaceAll('.', '\\.')}<\\/span>`), 'Install dialog fallback version is stale');
assert.ok(Array.isArray(release.notes) && release.notes.length > 0, 'Release notes must not be empty');

console.log(`Release metadata is consistent for version ${appVersion}.`);
