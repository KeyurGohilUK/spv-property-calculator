import { test, expect } from '@playwright/test';

async function mockCompanyWorkspace(page, role = 'editor', initialProfile = null) {
  await page.addInitScript(({ workspaceRole, profile }) => {
    if (profile && !localStorage.getItem('spv-property-calculator.company-profile.v1')) {
      localStorage.setItem('spv-property-calculator.company-profile.v1', JSON.stringify(profile));
    }
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
  await mockCompanyWorkspace(page, 'editor', { companyName: 'Initial SPV Ltd', companyNumber: '87654321', appointments: [] });
  await page.goto('/company/');
  await expect(page.getByRole('heading', { name: 'Manage Companies' })).toBeVisible();
  await page.getByRole('link', { name: /Initial SPV Ltd/ }).click();
  await expect(page.getByRole('heading', { name: 'Company Details' })).toBeVisible();
  const editCompanyButton = page.getByRole('button', { name: 'Edit company details' });
  await expect(editCompanyButton.locator('svg')).toBeVisible();
  await editCompanyButton.click();
  const cancelCompanyDetailsButton = page.locator('#cancelCompanyDetailsBtn');
  const saveCompanyDetailsButton = page.locator('#companyDetailsForm button[type="submit"]');
  await expect(cancelCompanyDetailsButton).toBeVisible();
  await expect(saveCompanyDetailsButton).toBeVisible();
  const companyDetailsLayout = await page.evaluate(() => {
    const actions = document.querySelector('.company-form-actions').getBoundingClientRect();
    const cancel = document.querySelector('#cancelCompanyDetailsBtn').getBoundingClientRect();
    const save = document.querySelector('#companyDetailsForm button[type="submit"]').getBoundingClientRect();
    const dateField = document.querySelector('#companyDateInput').getBoundingClientRect();
    const dateLabel = document.querySelector('#companyDateInput').parentElement.getBoundingClientRect();
    return {
      actionsRight: actions.right,
      cancelWidth: cancel.width,
      saveWidth: save.width,
      saveRight: save.right,
      dateFieldRight: dateField.right,
      dateLabelRight: dateLabel.right
    };
  });
  expect(Math.abs(companyDetailsLayout.cancelWidth - companyDetailsLayout.saveWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(companyDetailsLayout.actionsRight - companyDetailsLayout.saveRight)).toBeLessThanOrEqual(1);
  expect(companyDetailsLayout.dateFieldRight).toBeLessThanOrEqual(companyDetailsLayout.dateLabelRight + 1);
  await page.getByLabel('Company name').fill('Example Property SPV Ltd');
  await page.getByLabel('Company number').fill('01234567');
  await page.getByLabel('Registered office').fill('1 Example Street, Bristol');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#companyNameValue')).toHaveText('Example Property SPV Ltd');
  await expect(page.locator('#companyNumberValue')).toHaveText('01234567');

  await page.getByRole('tab', { name: 'Appointment' }).click();
  await page.getByRole('button', { name: 'Add person' }).click();
  await page.getByLabel('Full name').fill('Alex Director');
  await page.getByLabel('Director', { exact: true }).check();
  await page.getByLabel('Person with significant control (PSC)').check();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#companyAppointmentsTable')).toContainText('Alex Director');
  await expect(page.locator('#companyAppointmentsRows')).toContainText('✓');
  await expect.poll(() => page.evaluate(() => window.savedCompanyProfile?.appointments?.length)).toBe(1);

  await expect(page.getByRole('link', { name: 'Company', exact: true })).toBeVisible();
});

test('@mobile company appointment table remains usable in a horizontally scrollable panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockCompanyWorkspace(page, 'editor', {
    companyName: 'Example SPV Ltd',
    appointments: [{ id: 'director-1', name: 'Alex Director', roles: ['director', 'psc'] }]
  });
  await page.goto('/company/');
  await page.getByRole('link', { name: /Example SPV Ltd/ }).click();
  await page.getByRole('tab', { name: 'Appointment' }).click();
  await expect(page.locator('#companyAppointmentsTitle')).toBeVisible();
  await expect(page.locator('#companyAppointmentsTable')).toContainText('Alex Director');
  const dimensions = await page.locator('#companyAppointmentsTable').evaluate((element) => ({
    viewport: element.clientWidth,
    content: element.scrollWidth
  }));
  expect(dimensions.content).toBeGreaterThan(dimensions.viewport);
  await page.locator('#companyAppointmentsTable').evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  const editAppointmentButton = page.getByRole('button', { name: 'Edit appointment for Alex Director' });
  await expect(editAppointmentButton).toBeVisible();
  await expect(editAppointmentButton.locator('svg')).toBeVisible();
});

test('workspace viewers can read but not edit company records', async ({ page }) => {
  await mockCompanyWorkspace(page, 'viewer', {
    companyName: 'Read Only SPV Ltd',
    appointments: [{ id: 'director-1', name: 'Alex Director', roles: ['director'] }]
  });
  await page.goto('/company/');
  await expect(page.getByRole('button', { name: /Add new company/ })).toBeDisabled();
  await page.getByRole('link', { name: /Read Only SPV Ltd/ }).click();
  await expect(page.locator('#companyNameValue')).toHaveText('Read Only SPV Ltd');
  await expect(page.getByRole('button', { name: 'Edit company details' })).toBeDisabled();
  await page.getByRole('tab', { name: 'Appointment' }).click();
  await expect(page.getByRole('button', { name: 'Add person' })).toBeDisabled();
  await expect(page.locator('#openDeleteCompanyBtn')).toBeDisabled();
  await expect(page.getByText(/View-only/)).toBeVisible();
});

test('company chooser adds a second company without changing the first', async ({ page }) => {
  await mockCompanyWorkspace(page, 'editor', {
    companyName: 'First SPV Ltd', companyNumber: '11111111',
    appointments: [{ id: 'person-1', name: 'First Director', roles: ['director'] }]
  });
  await page.goto('/company/');
  await expect(page.getByRole('link', { name: /First SPV Ltd/ })).toBeVisible();
  await page.getByRole('button', { name: /Add new company/ }).click();
  await page.getByLabel('Company name').fill('Second SPV Ltd');
  await page.getByRole('button', { name: 'Add company', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Company Details' })).toBeVisible();
  await expect(page.locator('#companyNameValue')).toHaveText('Second SPV Ltd');
  await page.getByRole('tab', { name: 'Appointment' }).click();
  await expect(page.locator('#companyAppointmentsEmpty')).toBeVisible();
  await page.getByRole('link', { name: /All companies/ }).click();
  await expect(page.getByRole('link', { name: /First SPV Ltd/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Second SPV Ltd/ })).toBeVisible();
});

test('editor confirms company deletion and keeps other workspace data', async ({ page }) => {
  await mockCompanyWorkspace(page, 'editor', {
    companyName: 'Temporary SPV Ltd', companyNumber: '11223344',
    appointments: [{ id: 'dir-1', name: 'Director One', roles: ['director'] }],
    investments: [{ id: 'invest-1', memberId: 'dir-1', memberName: 'Director One', amount: 1000 }]
  });
  await page.goto('/company/');
  await page.getByRole('link', { name: /Temporary SPV Ltd/ }).click();
  const deleteButton = page.locator('#openDeleteCompanyBtn');
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();
  await expect(page.locator('#deleteCompanyName')).toHaveText('Temporary SPV Ltd');
  await page.locator('#confirmDeleteCompanyInput').fill('wrong');
  await page.locator('#confirmDeleteCompanyBtn').click();
  await expect(page.locator('#deleteCompanyMessage')).toContainText('Type DELETE');
  await page.locator('#confirmDeleteCompanyInput').fill('DELETE');
  await page.locator('#confirmDeleteCompanyBtn').click();
  await expect(page.getByRole('heading', { name: 'Manage Companies' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Temporary SPV Ltd/ })).toHaveCount(0);
  const tombstone = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('spv-property-calculator.company-profile.v1'))
  );
  expect(tombstone.deletedAt).toBeTruthy();
  expect(tombstone.appointments).toHaveLength(1);
  expect(tombstone.investments).toHaveLength(1);
  await page.goto('/company/details.html?company=default');
  await expect(page.getByRole('heading', { name: 'Manage Companies' })).toBeVisible();
});
