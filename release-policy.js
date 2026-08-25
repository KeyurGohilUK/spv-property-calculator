function versionParts(value) {
  if (!/^\d+\.\d+\.\d+$/.test(String(value || ''))) {
    throw new Error(`Invalid semantic version: ${value || '(empty)'}`);
  }
  return String(value).split('.').map(Number);
}

export function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

export function extractCachedAssetPaths(assetSource) {
  try {
    const manifest = JSON.parse(String(assetSource || ''));
    if (Array.isArray(manifest.assets)) {
      return new Set(manifest.assets
        .map((path) => String(path).replace(/^\.\//, ''))
        .filter(Boolean));
    }
  } catch {
    // Older releases stored the asset list directly in the service worker.
  }
  const assetsBlock = String(assetSource || '').match(/const ASSETS = \[([\s\S]*?)\]\.map/)?.[1] || '';
  return new Set(
    [...assetsBlock.matchAll(/['"]\.\/([^'"]+)['"]/g)]
      .map((match) => match[1])
      .filter(Boolean)
  );
}

export function cachedAppChanges(changedPaths, baseAssetSource, currentAssetSource) {
  const cachedPaths = new Set([
    ...extractCachedAssetPaths(baseAssetSource),
    ...extractCachedAssetPaths(currentAssetSource),
    'app-assets.json',
    'service-worker.js'
  ]);
  return changedPaths.filter((path) => cachedPaths.has(path) && path !== 'release.json');
}

export function assertReleaseBumped({ baseVersion, currentVersion, changedCachedPaths }) {
  if (!changedCachedPaths.length) return;
  if (compareVersions(currentVersion, baseVersion) <= 0) {
    throw new Error(
      `Cached app files changed without a release bump. `
      + `Increase release.json above ${baseVersion}. Changed: ${changedCachedPaths.join(', ')}`
    );
  }
}
