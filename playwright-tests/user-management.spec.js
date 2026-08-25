import { test, expect } from '@playwright/test';

const adminUser = { id: 'admin-1', email: 'admin@example.com' };
const users = [
  { user_id: 'admin-1', email: 'admin@example.com', display_name: 'Admin User', role: 'admin', active: true, last_sign_in_at: '2026-08-24T10:00:00Z' },
  { user_id: 'user-2', email: 'colleague@example.com', display_name: 'Colleague', role: null, active: false, last_sign_in_at: null }
];

async function mockCloud(page, role = 'admin') {
  await page.addInitScript(({ user, workspaceUsers, workspaceRole }) => {
    localStorage.setItem('spv-help-guide-seen', 'true');
    window.SPVCloud = {
      init: async () => ({ configured: true, available: true, user }),
      onAuthChange: () => () => {},
      getCurrentUser: () => user,
      getConfigState: () => ({ configured: true, available: true }),
      getWorkspaceAccess: async () => ({ role: workspaceRole, active: true }),
      listWorkspaceUsers: async () => workspaceUsers,
      setWorkspaceUserAccess: async (userId, nextRole, active) => {
        window.savedUserAccess = { userId, role: nextRole, active };
      }
    };
  }, { user: adminUser, workspaceUsers: users, workspaceRole: role });
  await page.route('**/cloud.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: '// SPVCloud is supplied by the test init script.'
  }));
}

test('administrator can review and update workspace access', async ({ page }) => {
  await mockCloud(page);
  await page.goto('./admin/users/');

  await expect(page.getByRole('heading', { name: 'Manage Users' })).toBeVisible();
  await expect(page.locator('.user-card')).toHaveCount(2);
  await expect(page.getByText('colleague@example.com')).toBeVisible();
  await expect(page.locator('#userManagementSyncStatus')).toHaveText('Users up to date');
  await expect(page.getByRole('button', { name: 'Refresh' })).toHaveCount(0);

  const roleGuide = page.locator('#userRoleGuide');
  await expect(roleGuide).not.toHaveAttribute('open', '');
  await roleGuide.locator('summary').click();
  await expect(roleGuide).toHaveAttribute('open', '');
  await expect(roleGuide.getByRole('heading', { name: 'Viewer' })).toBeVisible();
  await expect(roleGuide.getByRole('heading', { name: 'Editor' })).toBeVisible();
  await expect(roleGuide.getByRole('heading', { name: 'Admin' })).toBeVisible();

  const colleague = page.locator('[data-user-id="user-2"]');
  await colleague.locator('[data-user-role]').selectOption('editor');
  await colleague.locator('[data-user-active]').check();
  await colleague.locator('[data-save-user]').click();

  await expect.poll(() => page.evaluate(() => window.savedUserAccess)).toEqual({
    userId: 'user-2',
    role: 'editor',
    active: true
  });
  await expect(page.locator('#userManagementSyncStatus')).toHaveText('Users up to date');
});

test('non-admin is denied and does not see Manage Users in the menu', async ({ page }) => {
  await mockCloud(page, 'viewer');
  await page.goto('./admin/users/');

  await expect(page.getByRole('heading', { name: 'Administrator access required' })).toBeVisible();
  await page.locator('[data-more-menu]').click();
  await expect(page.locator('[data-admin-users-link]')).toBeHidden();
});
