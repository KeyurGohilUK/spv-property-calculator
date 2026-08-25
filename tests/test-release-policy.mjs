import assert from 'node:assert/strict';
import {
  assertReleaseBumped,
  cachedAppChanges,
  compareVersions,
  extractCachedAssetPaths
} from '../release-policy.js';

const baseWorker = "const ASSETS = ['./styles.css', './old.js'].map((path) => path);";
const currentWorker = "const ASSETS = ['./styles.css', './new.js'].map((path) => path);";
const currentManifest = JSON.stringify({ version: '1.21.4', assets: ['./styles.css', './new.js'] });

assert.equal(compareVersions('1.22.0', '1.21.9'), 1);
assert.equal(compareVersions('1.21.4', '1.21.4'), 0);
assert.equal(compareVersions('1.20.9', '1.21.0'), -1);
assert.throws(() => compareVersions('1.21', '1.21.0'), /Invalid semantic version/);
assert.deepEqual([...extractCachedAssetPaths(baseWorker)], ['styles.css', 'old.js']);
assert.deepEqual([...extractCachedAssetPaths(currentManifest)], ['styles.css', 'new.js']);
assert.deepEqual(
  cachedAppChanges(['styles.css', 'old.js', 'new.js', 'app-assets.json', 'README.md', 'release.json'], baseWorker, currentManifest),
  ['styles.css', 'old.js', 'new.js', 'app-assets.json']
);
assert.deepEqual(
  cachedAppChanges(['styles.css', 'old.js', 'new.js', 'README.md', 'release.json'], baseWorker, currentWorker),
  ['styles.css', 'old.js', 'new.js']
);
assert.doesNotThrow(() => assertReleaseBumped({ baseVersion: '1.21.3', currentVersion: '1.21.4', changedCachedPaths: ['styles.css'] }));
assert.doesNotThrow(() => assertReleaseBumped({ baseVersion: '1.21.3', currentVersion: '1.21.3', changedCachedPaths: [] }));
assert.throws(
  () => assertReleaseBumped({ baseVersion: '1.21.3', currentVersion: '1.21.3', changedCachedPaths: ['styles.css'] }),
  /Cached app files changed without a release bump/
);

console.log('Pull-request release policy checks passed.');
