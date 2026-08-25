import assert from 'node:assert/strict';
import fs from 'node:fs';

const installSource = fs.readFileSync(new URL('../src/components/install-component.js', import.meta.url), 'utf8');
const workerSource = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const release = JSON.parse(fs.readFileSync(new URL('../release.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const assetManifest = JSON.parse(fs.readFileSync(new URL('../app-assets.json', import.meta.url), 'utf8'));

const appVersion = installSource.match(/APP_VERSION = '([^']+)'/)?.[1];
const cacheVersion = workerSource.match(/CACHE_NAME = 'spv-property-calculator-v([0-9]+\.[0-9]+\.[0-9]+)-/)?.[1];

assert.ok(appVersion, 'APP_VERSION was not found in src/components/install-component.js');
assert.ok(cacheVersion, 'Semantic cache version was not found in service-worker.js');
assert.equal(release.version, appVersion, 'release.json and APP_VERSION must match');
assert.equal(cacheVersion, appVersion, 'Service-worker cache version and APP_VERSION must match');
assert.equal(assetManifest.version, appVersion, 'Asset-manifest version and APP_VERSION must match');
assert.ok(Array.isArray(assetManifest.assets) && assetManifest.assets.length > 0, 'Asset manifest must contain app files');
assert.equal(new Set(assetManifest.assets).size, assetManifest.assets.length, 'Asset manifest must not contain duplicate paths');
assert.ok(assetManifest.assets.every((path) => typeof path === 'string' && path.startsWith('./')), 'Asset paths must be app-relative');
assert.match(workerSource, /ASSET_MANIFEST_URL[\s\S]*fetch\(ASSET_MANIFEST_URL, \{ cache: 'no-store' \}\)[\s\S]*cache\.addAll\(manifest\.assets/, 'Service worker must populate its cache from the asset manifest');
assert.match(workerSource, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE_NAME/, 'Service worker must preserve unrelated browser caches');
assert.match(workerSource, /App assets are network-first[\s\S]*fetch\(event\.request\)[\s\S]*catch\(\(\) => caches\.match\(event\.request\)\)/, 'App assets must refresh online and fall back to cache offline');
assert.match(installSource, /Version \$\{APP_VERSION\}/, 'Shared Install dialog must render the current fallback version');
assert.match(installSource, /APP_ASSET_MANIFEST[\s\S]*loadAppAssets[\s\S]*cache: 'reload'/, 'Manual updater must load the current asset manifest');
assert.doesNotMatch(installSource, /caches\.delete/, 'Manual updater must not delete a working cache before validating the new release');
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
  assert.ok(assetManifest.assets.includes(src), `${src} is not cached for offline use`);
}

for (const asset of assetManifest.assets) {
  const relativePath = asset.slice(2);
  const filePath = relativePath === '' ? 'index.html' : relativePath.endsWith('/') ? `${relativePath}index.html` : relativePath;
  assert.ok(fs.existsSync(new URL(`../${filePath}`, import.meta.url)), `${asset} does not resolve to a local app file`);
}

console.log(`Release metadata is consistent for version ${appVersion}.`);
