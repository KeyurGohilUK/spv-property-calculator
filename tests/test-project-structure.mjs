import assert from 'node:assert/strict';
import fs from 'node:fs';

const projectRoot = new URL('../', import.meta.url);
const requiredDirectories = [
  'database/bootstrap/',
  'database/migrations/',
  'docs/setup/',
  'docs/planning/',
  'docs/history/',
  'src/app/',
  'src/features/properties/',
  'src/features/expenses/',
  'src/features/forecast/',
  'src/features/users/',
  'src/services/',
  'src/config/',
  'src/utils/',
  'src/components/',
  'workers/receipt/',
  'tests/e2e/'
];

for (const path of requiredDirectories) {
  assert.equal(fs.statSync(new URL(path, projectRoot)).isDirectory(), true, `${path} must remain a directory`);
}

const rootMarkdown = fs.readdirSync(projectRoot).filter((name) => name.endsWith('.md')).sort();
assert.deepEqual(rootMarkdown, ['README.md'], 'Only the main README should remain at the repository root');
assert.equal(fs.existsSync(new URL('database-scripts/', projectRoot)), false, 'Legacy database-scripts directory must not return');
assert.equal(fs.existsSync(new URL('playwright-tests/', projectRoot)), false, 'Legacy playwright-tests directory must not return');
assert.equal(fs.existsSync(new URL('cloudflare/receipt-worker/', projectRoot)), false, 'Legacy receipt-worker directory must not return');

for (const utility of ['format-utils.js', 'validation.js']) {
  assert.equal(fs.existsSync(new URL(`src/utils/${utility}`, projectRoot)), true, `${utility} must remain under src/utils`);
  const compatibilitySource = fs.readFileSync(new URL(utility, projectRoot), 'utf8');
  assert.match(compatibilitySource, new RegExp(`export \\* from '\\.\\/src\\/utils\\/${utility.replace('.', '\\.')}';`), `${utility} must retain its previous URL as a compatibility export`);
}

const organisedModules = {
  'src/features/properties/': ['calculations.js', 'property-card.js', 'storage.js'],
  'src/features/expenses/': ['expenses.js', 'expense-storage.js', 'expense-cloud-sync.js'],
  'src/features/forecast/': ['forecast.js', 'forecast-property.js', 'forecast-advanced.js'],
  'src/features/users/': ['manage-users.js'],
  'src/services/': ['workspace-sync.js', 'receipt-cloud.js', 'account-controller.js'],
  'src/config/': ['tax-config.js']
};

for (const [directory, modules] of Object.entries(organisedModules)) {
  for (const module of modules) {
    assert.equal(fs.existsSync(new URL(`${directory}${module}`, projectRoot)), true, `${module} must remain under ${directory}`);
    assert.equal(
      fs.readFileSync(new URL(module, projectRoot), 'utf8').includes(`export * from './${directory}${module}';`),
      true,
      `${module} must retain its root URL as a compatibility export`
    );
  }
}

assert.equal(fs.existsSync(new URL('src/features/properties/calendar-invite.js', projectRoot)), true, 'calendar-invite.js must remain with the property feature');
assert.equal(
  fs.readFileSync(new URL('src/utils/calendar-invite.js', projectRoot), 'utf8').includes("export * from '../features/properties/calendar-invite.js';"),
  true,
  'calendar-invite.js must retain its previous utility URL as a compatibility export'
);
assert.equal(
  fs.readFileSync(new URL('calendar-invite.js', projectRoot), 'utf8').includes("export * from './src/features/properties/calendar-invite.js';"),
  true,
  'calendar-invite.js must retain its root URL as a compatibility export'
);

for (const component of ['dialog-helper.js', 'sync-status.js', 'install-component.js', 'update-notifier.js']) {
  assert.equal(fs.existsSync(new URL(`src/components/${component}`, projectRoot)), true, `${component} must remain under src/components`);
  const compatibilitySource = fs.readFileSync(new URL(component, projectRoot), 'utf8');
  assert.match(compatibilitySource, new RegExp(`export \\* from '\\.\\/src\\/components\\/${component.replace('.', '\\.')}';`), `${component} must retain its previous URL as a compatibility export`);
}

for (const appModule of ['app-shell.js', 'primary-navigation.js']) {
  assert.equal(fs.existsSync(new URL(`src/app/${appModule}`, projectRoot)), true, `${appModule} must remain under src/app`);
  assert.equal(
    fs.readFileSync(new URL(`src/components/${appModule}`, projectRoot), 'utf8').includes(`export * from '../app/${appModule}';`),
    true,
    `${appModule} must retain its previous component URL as a compatibility export`
  );
  assert.equal(
    fs.readFileSync(new URL(appModule, projectRoot), 'utf8').includes(`export * from './src/app/${appModule}';`),
    true,
    `${appModule} must retain its root URL as a compatibility export`
  );
}

assert.equal(fs.existsSync(new URL('src/app/app.js', projectRoot)), true, 'app.js must remain under src/app');
assert.match(
  fs.readFileSync(new URL('app.js', projectRoot), 'utf8'),
  /export \* from '\.\/src\/app\/app\.js';/,
  'app.js must retain its root URL as a compatibility entry point'
);

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

assert.equal(fs.existsSync(new URL('src/components/theme.js', projectRoot)), true, 'theme.js must remain under src/components');
assert.match(
  fs.readFileSync(new URL('theme.js', projectRoot), 'utf8'),
  /import\('\.\/src\/components\/theme\.js'\);/,
  'theme.js must retain its previous URL as a classic-script compatibility entry point'
);

console.log('Project folder structure checks passed.');
