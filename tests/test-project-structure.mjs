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
  'src/components/',
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

for (const component of ['dialog-helper.js', 'sync-status.js', 'primary-navigation.js', 'app-shell.js', 'install-component.js', 'update-notifier.js']) {
  assert.equal(fs.existsSync(new URL(`src/components/${component}`, projectRoot)), true, `${component} must remain under src/components`);
  const compatibilitySource = fs.readFileSync(new URL(component, projectRoot), 'utf8');
  assert.match(compatibilitySource, new RegExp(`export \\* from '\\.\\/src\\/components\\/${component.replace('.', '\\.')}';`), `${component} must retain its previous URL as a compatibility export`);
}

assert.equal(fs.existsSync(new URL('src/components/secondary-page-header.js', projectRoot)), true, 'secondary-page-header.js must remain under src/components');
assert.match(
  fs.readFileSync(new URL('secondary-page-header.js', projectRoot), 'utf8'),
  /import '\.\/src\/components\/secondary-page-header\.js';/,
  'secondary-page-header.js must retain its previous URL as a compatibility entry point'
);

for (const component of ['help-guide.js', 'admin-menu.js']) {
  assert.equal(fs.existsSync(new URL(`src/components/${component}`, projectRoot)), true, `${component} must remain under src/components`);
  const compatibilitySource = fs.readFileSync(new URL(component, projectRoot), 'utf8');
  assert.match(
    compatibilitySource,
    new RegExp(`import '\\.\\/src\\/components\\/${component.replace('.', '\\.')}';`),
    `${component} must retain its previous URL as a compatibility entry point`
  );
}

console.log('Project folder structure checks passed.');
