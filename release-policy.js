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

export function extractCachedAssetPaths(workerSource) {
  const assetsBlock = String(workerSource || '').match(/const ASSETS = \[([\s\S]*?)\]\.map/)?.[1] || '';
  return new Set(
    [...assetsBlock.matchAll(/['"]\.\/([^'"]+)['"]/g)]
      .map((match) => match[1])
      .filter(Boolean)
  );
}

export function cachedAppChanges(changedPaths, baseWorkerSource, currentWorkerSource) {
  const cachedPaths = new Set([
    ...extractCachedAssetPaths(baseWorkerSource),
    ...extractCachedAssetPaths(currentWorkerSource),
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
