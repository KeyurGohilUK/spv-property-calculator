import assert from 'node:assert/strict';
import fs from 'node:fs';

const installSource = fs.readFileSync(new URL('../install-component.js', import.meta.url), 'utf8');
const workerSource = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const release = JSON.parse(fs.readFileSync(new URL('../release.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

const appVersion = installSource.match(/APP_VERSION = '([^']+)'/)?.[1];
const cacheVersion = workerSource.match(/CACHE_NAME = 'spv-property-calculator-v([0-9]+\.[0-9]+\.[0-9]+)-/)?.[1];

assert.ok(appVersion, 'APP_VERSION was not found in install-component.js');
assert.ok(cacheVersion, 'Semantic cache version was not found in service-worker.js');
assert.equal(release.version, appVersion, 'release.json and APP_VERSION must match');
assert.equal(cacheVersion, appVersion, 'Service-worker cache version and APP_VERSION must match');
assert.match(workerSource, /App assets are network-first[\s\S]*fetch\(event\.request\)[\s\S]*catch\(\(\) => caches\.match\(event\.request\)\)/, 'App assets must refresh online and fall back to cache offline');
assert.match(installSource, /Version \$\{APP_VERSION\}/, 'Shared Install dialog must render the current fallback version');
assert.ok(Array.isArray(release.notes) && release.notes.length > 0, 'Release notes must not be empty');

const expectedIcons = [
  ['./icons/icon-192.png', 192, 'any'],
  ['./icons/icon-512.png', 512, 'any'],
  ['./icons/icon-maskable-192.png', 192, 'maskable'],
  ['./icons/icon-maskable-512.png', 512, 'maskable']
];

for (const [src, size, purpose] of expectedIcons) {
  const icon = manifest.icons.find((entry) => entry.src === src);
  assert.ok(icon, `Manifest icon ${src} is missing`);
  assert.equal(icon.sizes, `${size}x${size}`, `Manifest size for ${src} is incorrect`);
  assert.equal(icon.purpose, purpose, `Manifest purpose for ${src} is incorrect`);

  const iconBytes = fs.readFileSync(new URL(`../${src}`, import.meta.url));
  assert.equal(iconBytes.readUInt32BE(16), size, `${src} width is incorrect`);
  assert.equal(iconBytes.readUInt32BE(20), size, `${src} height is incorrect`);
  assert.match(workerSource, new RegExp(src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${src} is not cached for offline use`);
}

console.log(`Release metadata is consistent for version ${appVersion}.`);
