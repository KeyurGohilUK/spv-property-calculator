import assert from 'node:assert/strict';
import fs from 'node:fs';

const projectRoot = new URL('../', import.meta.url);
const requiredDirectories = [
  'database/bootstrap/',
  'database/migrations/',
  'docs/setup/',
  'docs/planning/',
  'docs/history/',
  'tests/e2e/'
];

for (const path of requiredDirectories) {
  assert.equal(fs.statSync(new URL(path, projectRoot)).isDirectory(), true, `${path} must remain a directory`);
}

const rootMarkdown = fs.readdirSync(projectRoot).filter((name) => name.endsWith('.md')).sort();
assert.deepEqual(rootMarkdown, ['README.md'], 'Only the main README should remain at the repository root');
assert.equal(fs.existsSync(new URL('database-scripts/', projectRoot)), false, 'Legacy database-scripts directory must not return');
assert.equal(fs.existsSync(new URL('playwright-tests/', projectRoot)), false, 'Legacy playwright-tests directory must not return');

console.log('Project folder structure checks passed.');
