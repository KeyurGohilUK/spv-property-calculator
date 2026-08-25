import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../database/migrations/Update 13 - Admin User Management.sql', import.meta.url), 'utf8');
const bootstrap = fs.readFileSync(new URL('../database/bootstrap/00 - Bootstrap Complete Schema.sql', import.meta.url), 'utf8');
const cloud = fs.readFileSync(new URL('../cloud.js', import.meta.url), 'utf8');
const adminMenu = fs.readFileSync(new URL('../src/components/admin-menu.js', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../admin/users/index.html', import.meta.url), 'utf8');
const pageScript = fs.readFileSync(new URL('../src/features/users/manage-users.js', import.meta.url), 'utf8');
const pageStyles = fs.readFileSync(new URL('../styles/features/users.css', import.meta.url), 'utf8');
const appShell = fs.readFileSync(new URL('../src/app/app-shell.js', import.meta.url), 'utf8');
const appAssets = JSON.parse(fs.readFileSync(new URL('../app-assets.json', import.meta.url), 'utf8')).assets;

for (const sql of [migration, bootstrap]) {
  assert.match(sql, /create or replace function public\.list_workspace_users\(\)/, 'User listing RPC is missing');
  assert.match(sql, /create or replace function public\.set_workspace_user_access/, 'User access update RPC is missing');
  assert.match(sql, /not public\.is_workspace_admin\(\)/, 'User management must require an administrator');
  assert.match(sql, /p_user_id\s*=\s*auth\.uid\(\)/, 'Administrator self-lockout protection is missing');
  assert.match(sql, /p_role not in \('viewer'\s*,\s*'editor'\s*,\s*'admin'\)/, 'Role validation is missing');
  assert.match(sql, /from auth\.users/, 'Registered Auth users must be available for approval');
  assert.match(sql, /revoke all on function public\.set_workspace_user_access/, 'Public user-management access must be revoked');
}
assert.match(cloud, /getWorkspaceAccess[\s\S]*listWorkspaceUsers[\s\S]*setWorkspaceUserAccess/, 'Cloud API must expose user-management operations');
assert.match(adminMenu, /access\.role === 'admin'/, 'Manage Users menu must be admin-only');
assert.match(appShell, /data-admin-users-link[^>]*aria-hidden="true"/, 'Shared admin menu item must be hidden by default');
assert.match(page, /id="userAccessDenied"[\s\S]*id="userManagementContent"/, 'Manage Users page must include a guarded access state');
assert.match(pageScript, /access\.role !== 'admin'/, 'Manage Users page must reject non-admin users');
assert.match(pageScript, /import \{ renderSyncStatus \} from '\.\.\/\.\.\/components\/sync-status\.js';/, 'Manage Users must use the shared sync-status component');
assert.match(page, /id="userManagementSyncStatus" class="sync-status"/, 'Manage Users hero sync status is missing');
assert.doesNotMatch(page + pageScript, /refreshUsersBtn|>Refresh<\//, 'Manage Users must not include a manual refresh action');
assert.match(pageScript, /setWorkspaceUserAccess\(userId, role, active\)/, 'Manage Users page must save role and active access');
assert.match(pageScript, /withTimeout[\s\S]*Account check timed out[\s\S]*Administrator check timed out/, 'Manage Users must not remain indefinitely in its checking state');
assert.match(pageStyles, /@media \(max-width: 560px\)/, 'Manage Users page must provide a mobile layout');
assert.match(page, /<details id="userRoleGuide" class="user-role-guide">/, 'Role guidance must use a collapsed details element');
assert.doesNotMatch(page, /<details[^>]*userRoleGuide[^>]*\sopen(?:\s|>)/, 'Role guidance must be collapsed by default');
for (const role of ['Viewer', 'Editor', 'Admin']) assert.match(page, new RegExp(`<h3>${role}<\\/h3>`), `${role} guidance is missing`);
assert.ok(appAssets.includes('./admin/users/'), 'Manage Users clean route must be available in the offline app shell');


assert.equal((bootstrap.match(/^commit;$/gm) || []).length, 1, 'Bootstrap must contain one transaction commit');
assert.equal((bootstrap.match(/create index if not exists expenses_date_idx/g) || []).length, 1, 'Bootstrap must not duplicate the expense schema');
const receiptConstraint = bootstrap.slice(bootstrap.indexOf('expenses_receipt_object_path_check'), bootstrap.indexOf('expenses_date_idx'));
assert.match(receiptConstraint, /receipt_object_path ~ /, 'Bootstrap receipt object-path constraint must contain its validation pattern');
assert.match(receiptConstraint, /\n  \)\n\);/, 'Bootstrap receipt object-path constraint must close before its index');

console.log('Admin user-management checks passed.');
