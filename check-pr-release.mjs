import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { assertReleaseBumped, cachedAppChanges } from './release-policy.js';

const baseSha = process.env.BASE_SHA || process.argv[2];
if (!baseSha) throw new Error('BASE_SHA is required for the pull-request release check.');

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function readBaseFile(path) {
  return git('show', `${baseSha}:${path}`);
}

function readBaseFileIfExists(path) {
  try {
    execFileSync('git', ['cat-file', '-e', `${baseSha}:${path}`], { stdio: 'ignore' });
    return readBaseFile(path);
  } catch {
    return '';
  }
}

const changedPaths = git('diff', '--name-only', `${baseSha}...HEAD`).split('\n').filter(Boolean);
const baseRelease = JSON.parse(readBaseFile('release.json'));
const currentRelease = JSON.parse(fs.readFileSync(new URL('./release.json', import.meta.url), 'utf8'));
const baseManifest = readBaseFileIfExists('app-assets.json');
const currentManifestUrl = new URL('./app-assets.json', import.meta.url);
const changedCachedPaths = cachedAppChanges(
  changedPaths,
  baseManifest || readBaseFile('service-worker.js'),
  fs.existsSync(currentManifestUrl)
    ? fs.readFileSync(currentManifestUrl, 'utf8')
    : fs.readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8')
);

assertReleaseBumped({
  baseVersion: baseRelease.version,
  currentVersion: currentRelease.version,
  changedCachedPaths
});

console.log(changedCachedPaths.length
  ? `Release ${currentRelease.version} correctly covers ${changedCachedPaths.length} cached app change(s).`
  : 'No cached app changes require a release bump.');
