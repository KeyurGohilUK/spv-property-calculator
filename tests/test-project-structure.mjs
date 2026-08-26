import assert from 'node:assert/strict';
import fs from 'node:fs';

const projectRoot = new URL('../', import.meta.url);
const requiredDirectories = [
  'database/bootstrap/', 'database/migrations/', 'docs/setup/', 'docs/push-notifications/', 'docs/planning/',
  'docs/history/', 'src/app/', 'src/features/properties/', 'src/features/expenses/',
  'src/features/forecast/', 'src/features/users/', 'src/services/', 'src/config/',
  'src/utils/', 'src/components/', 'workers/receipt/', 'supabase/functions/note-push/', 'tests/e2e/'
];

for (const path of requiredDirectories) {
  assert.equal(fs.statSync(new URL(path, projectRoot)).isDirectory(), true, `${path} must remain a directory`);
}

for (const document of ['README.md', 'SETUP.md', 'ARCHITECTURE.md', 'TESTING.md', 'TROUBLESHOOTING.md']) {
  assert.equal(fs.existsSync(new URL(`docs/push-notifications/${document}`, projectRoot)), true, `${document} must remain in the push-notification runbook`);
}

const rootMarkdown = fs.readdirSync(projectRoot).filter((name) => name.endsWith('.md')).sort();
assert.deepEqual(rootMarkdown, ['README.md'], 'Only the main README should remain at the repository root');
assert.equal(fs.existsSync(new URL('database-scripts/', projectRoot)), false, 'Legacy database-scripts directory must not return');
assert.equal(fs.existsSync(new URL('playwright-tests/', projectRoot)), false, 'Legacy playwright-tests directory must not return');
assert.equal(fs.existsSync(new URL('cloudflare/receipt-worker/', projectRoot)), false, 'Legacy receipt-worker directory must not return');

const organisedModules = {
  'src/app/': ['app.js', 'app-shell.js', 'primary-navigation.js'],
  'src/features/properties/': ['calculations.js', 'property-card.js', 'storage.js', 'calendar-invite.js'],
  'src/features/expenses/': ['expenses.js', 'expense-storage.js', 'expense-cloud-sync.js'],
  'src/features/forecast/': ['forecast.js', 'forecast-property.js', 'forecast-advanced.js'],
  'src/features/users/': ['manage-users.js'],
  'src/services/': ['workspace-sync.js', 'receipt-cloud.js', 'account-controller.js', 'access-gate.js', 'policy-acceptance.js', 'push-subscription.js'],
  'src/config/': ['tax-config.js'],
  'src/utils/': ['format-utils.js', 'validation.js'],
  'src/components/': [
    'admin-menu.js', 'dialog-helper.js', 'help-guide.js', 'install-component.js',
    'notification-settings.js', 'secondary-page-header.js', 'sync-status.js', 'theme.js', 'update-notifier.js'
  ]
};

for (const [directory, modules] of Object.entries(organisedModules)) {
  for (const module of modules) {
    assert.equal(fs.existsSync(new URL(`${directory}${module}`, projectRoot)), true, `${module} must remain under ${directory}`);
  }
}

const removedCompatibilityFiles = [
  'account-controller.js', 'admin-menu.js', 'app-shell.js', 'app.js', 'calculations.js',
  'calendar-invite.js', 'dialog-helper.js', 'expense-cloud-sync.js', 'expense-storage.js',
  'expenses.css', 'expenses.html', 'expenses.js', 'forecast-advanced.css',
  'forecast-advanced.js', 'forecast-property.js', 'forecast.css', 'forecast.html',
  'forecast.js', 'format-utils.js', 'help-guide.js', 'install-component.js',
  'manage-users.css', 'manage-users.html', 'manage-users.js', 'primary-navigation.js',
  'property-card.js', 'receipt-cloud.js', 'secondary-page-header.js', 'storage.js',
  'sync-status.js', 'tax-config.js', 'theme.js', 'update-notifier.js', 'validation.js',
  'workspace-sync.js', 'src/components/app-shell.js', 'src/components/primary-navigation.js',
  'src/utils/calendar-invite.js'
];

for (const path of removedCompatibilityFiles) {
  assert.equal(fs.existsSync(new URL(path, projectRoot)), false, `${path} must not return as a compatibility duplicate`);
}

console.log('Project folder structure checks passed.');
