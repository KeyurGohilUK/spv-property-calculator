import assert from 'node:assert/strict';
import fs from 'node:fs';

const projectRoot = new URL('../', import.meta.url);
const requiredDirectories = [
  'database/bootstrap/',
  'database/migrations/',
  'docs/setup/',
  'docs/planning/',
  'docs/history/',
  'src/utils/',
  'tests/e2e/'
];

for (const path of requiredDirectories) {
  assert.equal(fs.statSync(new URL(path, projectRoot)).isDirectory(), true, `${path} must remain a directory`);
}

const rootMarkdown = fs.readdirSync(projectRoot).filter((name) => name.endsWith('.md')).sort();
assert.deepEqual(rootMarkdown, ['README.md'], 'Only the main README should remain at the repository root');
assert.equal(fs.existsSync(new URL('database-scripts/', projectRoot)), false, 'Legacy database-scripts directory must not return');
assert.equal(fs.existsSync(new URL('playwright-tests/', projectRoot)), false, 'Legacy playwright-tests directory must not return');

for (const utility of ['format-utils.js', 'validation.js', 'calendar-invite.js']) {
  assert.equal(fs.existsSync(new URL(`src/utils/${utility}`, projectRoot)), true, `${utility} must remain under src/utils`);
  const compatibilitySource = fs.readFileSync(new URL(utility, projectRoot), 'utf8');
  assert.match(compatibilitySource, new RegExp(`export \\* from '\\.\\/src\\/utils\\/${utility.replace('.', '\\.')}';`), `${utility} must retain its previous URL as a compatibility export`);
}

console.log('Project folder structure checks passed.');
