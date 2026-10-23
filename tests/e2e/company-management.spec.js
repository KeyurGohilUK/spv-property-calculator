import { test, expect } from '@playwright/test';

async function mockCompanyWorkspace(page, role = 'editor', initialProfile = null) {
  await page.addInitScript(({ workspaceRole, profile }) => {
    if (profile) localStorage.setItem('spv-property-calculator.company-profile.v1', JSON.stringify(profile));
    const user = { id: 'company-user', email: 'company@example.com' };
    window.SPVCloud = {
      init: async () => ({ configured: true, available: true, user }),
      onAuthChange: () => () => {},
      onBeforeSignOut: () => () => {},
      getCurrentUser: () => user,
      getConfigState: () => ({ configured: true, available: true }),
      getWorkspaceAccess: async () => ({ role: workspaceRole, active: true }),
      getPolicyAcceptance: async () => ({ terms_version: '2026-08-26', privacy_version: '2026-08-26', disclaimer_version: '2026-08-26', accepted_at: '2026-08-26T10:00:00Z' }),
      acceptPolicies: async () => {},
      getCompanyProfile: async () => window.savedCompanyProfile || null,
      upsertCompanyProfile: async (profile) => {
        window.savedCompanyProfile = { ...profile, _cloudRevision: (profile._cloudRevision || 0) + 1, _cloudDirty: false };
        return window.savedCompanyProfile;
      },
      isCompanyProfileConflict: () => false,
      syncAll: async () => ({ merged: [], clearedDeleteIds: [], uploadedCount: 0, downloadedCount: 0, archivedLegacyIds: [], permanentlyDeletedIds: [], conflicts: [] }),
      listExpenses: async () => [],
      upsertExpense: async (item) => item,
      listTasks: async () => [],
      upsertTask: async (item) => item
    };
  }, { workspaceRole: role, profile: initialProfile });
  await page.route('**/cloud.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: '// SPVCloud is supplied by the test init script.'
  }));
}

test('editor manages company particulars and appointment roles', async ({ page }) => {
  await mockCompanyWorkspace(page);
  await page.goto('/company/');

  await expect(page.getByRole('heading', { name: 'Company Management' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit details' }).click();
  await page.getByLabel('Company name').fill('Example Property SPV Ltd');
  await page.getByLabel('Company number').fill('01234567');
  await page.getByLabel('Registered office').fill('1 Example Street, Bristol');
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.locator('#companyNameValue')).toHaveText('Example Property SPV Ltd');
  await expect(page.locator('#companyNumberValue')).toHaveText('01234567');

  await page.getByRole('button', { name: 'Add person' }).click();
  await page.getByLabel('Full name').fill('Alex Director');
  await page.getByLabel('Director', { exact: true }).check();
  await page.getByLabel('Person with significant control (PSC)').check();
  await page.getByRole('button', { name: 'Save person' }).click();
  await expect(page.locator('#companyAppointmentsTable')).toContainText('Alex Director');
  await expect(page.locator('#companyAppointmentsRows')).toContainText('✓');
  await expect.poll(() => page.evaluate(() => window.savedCompanyProfile?.appointments?.length)).toBe(1);

  await page.locator('[data-more-menu]').click();
  await expect(page.getByRole('link', { name: /Manage Company/ })).toBeVisible();
});

test('@mobile company appointment table remains usable in a horizontally scrollable panel', async ({ page }) => {
  await mockCompanyWorkspace(page, 'editor', {
    companyName: 'Example SPV Ltd',
    appointments: [{ id: 'director-1', name: 'Alex Director', roles: ['director', 'psc'] }]
  });
  await page.goto('/company/');
  await expect(page.getByRole('heading', { name: 'Appointments' })).toBeVisible();
  await expect(page.locator('#companyAppointmentsTable')).toContainText('Alex Director');
  const dimensions = await page.locator('#companyAppointmentsTable').evaluate((element) => ({
    viewport: element.clientWidth,
    content: element.scrollWidth
  }));
  expect(dimensions.content).toBeGreaterThan(dimensions.viewport);
  await page.locator('#companyAppointmentsTable').evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
});

test('workspace viewers can read but not edit company records', async ({ page }) => {
  await mockCompanyWorkspace(page, 'viewer', {
    companyName: 'Read Only SPV Ltd',
    appointments: [{ id: 'director-1', name: 'Alex Director', roles: ['director'] }]
  });
  await page.goto('/company/');
  await expect(page.locator('#companyNameValue')).toHaveText('Read Only SPV Ltd');
  await expect(page.getByRole('button', { name: 'Edit details' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add person' })).toBeDisabled();
  await expect(page.getByText(/View-only/)).toBeVisible();
});
