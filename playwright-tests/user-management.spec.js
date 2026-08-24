import { test, expect } from '@playwright/test';

const adminUser = { id: 'admin-1', email: 'admin@example.com' };
const users = [
  { user_id: 'admin-1', email: 'admin@example.com', display_name: 'Admin User', role: 'admin', active: true, last_sign_in_at: '2026-08-24T10:00:00Z' },
  { user_id: 'user-2', email: 'colleague@example.com', display_name: 'Colleague', role: null, active: false, last_sign_in_at: null }
];

async function mockCloud(page, role = 'admin') {
  await page.route('**/cloud.js', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `window.SPVCloud = {
        init: async () => ({ configured: true, available: true, user: ${JSON.stringify(adminUser)} }),
        onAuthChange: () => () => {},
        getCurrentUser: () => ${JSON.stringify(adminUser)},
        getConfigState: () => ({ configured: true, available: true }),
        getWorkspaceAccess: async () => ({ role: '${role}', active: true }),
        listWorkspaceUsers: async () => ${JSON.stringify(users)},
        setWorkspaceUserAccess: async (userId, nextRole, active) => { window.savedUserAccess = { userId, role: nextRole, active }; }
      };`
    });
  });
}

test('administrator can review and update workspace access', async ({ page }) => {
  await mockCloud(page);
  await page.goto('./manage-users.html');

  await expect(page.getByRole('heading', { name: 'Manage Users' })).toBeVisible();
  await expect(page.locator('.user-card')).toHaveCount(2);
  await expect(page.getByText('colleague@example.com')).toBeVisible();

  const colleague = page.locator('[data-user-id="user-2"]');
  await colleague.locator('[data-user-role]').selectOption('editor');
  await colleague.locator('[data-user-active]').check();
  await colleague.locator('[data-save-user]').click();

  await expect.poll(() => page.evaluate(() => window.savedUserAccess)).toEqual({
    userId: 'user-2',
    role: 'editor',
    active: true
  });
});

test('non-admin is denied and does not see Manage Users in the menu', async ({ page }) => {
  await mockCloud(page, 'viewer');
  await page.goto('./manage-users.html');

  await expect(page.getByRole('heading', { name: 'Administrator access required' })).toBeVisible();
  await page.locator('[data-more-menu]').click();
  await expect(page.locator('[data-admin-users-link]')).toBeHidden();
});
