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
  await expect(page.getByRole('button', { name: /New Company/ })).toBeDisabled();
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
  await page.getByRole('button', { name: /New Company/ }).click();
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

test('editor tracks HMRC periods, tax liability and payments through dialogs', async ({ page }) => {
  await mockCompanyWorkspace(page, 'editor', { companyName: 'Guided SPV Ltd' });
  await page.goto('/company/details.html?company=default');
  await page.getByRole('tab', { name: 'Compliance' }).click();
  await expect(page.locator('#hmrcSetupCards')).toContainText('UTR letter');
  await expect(page.locator('#hmrcRecurringViewTab')).toBeHidden();
  await page.locator('#hmrcSetupCards [data-hmrc-open="utr"]').click();
  await expect(page.locator('#hmrcSetupDialog')).toBeVisible();
  await page.locator('#hmrcUtrReceivedOn').fill('2026-02-04');
  await page.locator('#hmrcSetupForm button[type="submit"]').click();
  await expect(page.locator('#hmrcSetupDialog')).toBeHidden();
  await expect(page.locator('#hmrcSetupCards')).toContainText('Received 4 Feb 2026');
  await expect(page.locator('#hmrcSetupCards [data-hmrc-open="utr"]')).toBeFocused();
  await expect(page.locator('#complianceTabPanel')).not.toBeFocused();

  await page.locator('#hmrcSetupCards [data-hmrc-open="activity"]').click();
  await page.locator('input[name="hmrcActivity"][value="active"]').check();
  await page.locator('#hmrcActivityForm button[type="submit"]').click();
  await expect(page.locator('#hmrcSetupCards')).toContainText('Corporation Tax registration');
  await page.locator('#hmrcSetupCards [data-hmrc-open="registration"]').click();
  await page.locator('#hmrcRegistrationConfirmedOn').fill('2026-02-06');
  await page.locator('#hmrcAccountantName').fill('Example Accountants');
  await page.locator('#hmrcSetupForm button[type="submit"]').click();

  await expect(page.locator('#hmrcRecurringViewTab')).toBeVisible();
  await page.locator('#hmrcRecurringViewTab').click();
  await page.locator('#hmrcOpenPeriodDialog').click();
  await expect(page.locator('#hmrcPeriodDialog')).toBeVisible();
  await page.locator('#hmrcPeriodStart').fill('2026-01-01');
  await page.locator('#hmrcPeriodEnd').fill('2026-12-31');
  await page.locator('#hmrcPeriodForm button[type="submit"]').click();
  await expect(page.locator('#hmrcPeriodDialog')).toBeHidden();
  await expect(page.locator('#hmrcOpenPeriodDialog')).toBeFocused();
  await expect(page.locator('#hmrcPeriodHistory')).toContainText('31 Dec 2026');
  await expect(page.locator('#hmrcPeriodHistory')).toContainText('1 Oct 2027');
  await expect(page.locator('#hmrcPeriodHistory [data-hmrc-open="filing"]')).toHaveText('+ Record CT600');
  await expect(page.locator('#hmrcPeriodHistory .hmrc-pill--attention')).toContainText(['CT600 not recorded', 'Tax not assessed', 'Not recorded']);
  await expect(page.locator('#hmrcPeriodHistory .hmrc-summary-total')).toHaveCount(2);
  await expect(page.locator('#hmrcPeriodHistory .hmrc-value-attention').last()).toContainText('Unknown');

  await page.locator('#hmrcPeriodHistory [data-hmrc-open="filing"]').click();
  await expect(page.locator('#hmrcFilingDialog')).toBeVisible();
  await page.locator('#hmrcFiledOn').fill('2027-06-10');
  await page.locator('#hmrcFilingReference').fill('CT600-ACK');
  await page.locator('#hmrcLiability').fill('2400');
  await page.locator('#hmrcLiabilityStatus').selectOption('confirmed');
  await page.locator('#hmrcPeriodPaymentReference').fill('12345678901234567');
  await page.locator('#hmrcReviewedOn').fill('2027-06-09');
  await page.locator('#hmrcReviewedBy').fill('Example Accountants');
  await page.locator('#hmrcFilingForm button[type="submit"]').click();
  await expect(page.locator('#hmrcFilingDialog')).toBeHidden();
  await expect(page.locator('#hmrcPeriodHistory [data-hmrc-open="filing"]')).toBeFocused();
  await expect(page.locator('#hmrcPeriodHistory')).toContainText('CT600-ACK');
  await expect(page.locator('#hmrcPeriodHistory [data-hmrc-open="filing"]')).toHaveText('Edit CT600');
  await expect(page.locator('#hmrcPeriodHistory')).not.toContainText('12345678901234567');
  await expect(page.locator('#hmrcPeriodHistory')).toContainText('•••••34567');
  await page.locator('[data-hmrc-reveal-ref]').click();
  await expect(page.locator('#hmrcPeriodHistory')).toContainText('12345678901234567');
  await page.locator('[data-hmrc-reveal-ref]').click();
  await expect(page.locator('#hmrcPeriodHistory')).not.toContainText('12345678901234567');

  await page.locator('#hmrcPeriodHistory [data-hmrc-open="payment"]').click();
  await page.locator('#hmrcPaymentDate').fill('2027-06-12');
  await page.locator('#hmrcPaymentAmount').fill('1500');
  await page.locator('#hmrcPaymentReference').fill('Payment 1');
  await page.locator('#hmrcPaymentConfirmed').check();
  await page.locator('#hmrcPaymentForm button[type="submit"]').click();
  await expect(page.locator('#hmrcPaymentDialog')).toBeHidden();
  await expect(page.locator('#hmrcPeriodHistory [data-hmrc-open="payment"]')).toBeFocused();
  await expect(page.locator('#hmrcPeriodHistory')).toContainText('£900.00');
  await expect(page.locator('#hmrcPeriodHistory .hmrc-value-positive')).toContainText('£1,500.00');
  await expect(page.locator('#hmrcPeriodHistory')).toContainText('HMRC confirmed');
  await page.reload();
  await page.getByRole('tab', { name: 'Compliance' }).click();
  await expect(page.locator('#hmrcPeriodHistory')).toContainText('£900.00');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-hmrc-payment-remove]').click();
  await expect(page.locator('#hmrcPeriodHistory')).toContainText('£2,400.00');
});

test('HMRC setup remains compact while company is preparing to buy', async ({ page }) => {
  await mockCompanyWorkspace(page, 'editor', { companyName: 'Waiting SPV Ltd' });
  await page.goto('/company/details.html?company=default');
  await page.getByRole('tab', { name: 'Compliance' }).click();
  await page.locator('#hmrcSetupCards [data-hmrc-open="utr"]').click();
  await page.locator('#hmrcPendingBtn').click();
  await expect(page.locator('#hmrcSetupCards')).toContainText('Waiting');
  await expect(page.locator('#hmrcStatusNote')).toBeHidden();
  await page.locator('#hmrcSetupCards [data-hmrc-open="activity"]').click();
  await page.locator('input[name="hmrcActivity"][value="preparing"]').check();
  await page.locator('#hmrcActivityForm button[type="submit"]').click();
  await expect(page.locator('#hmrcSetupCards')).toContainText('Preparing to buy');
  await expect(page.locator('#hmrcRecurringViewTab')).toBeHidden();
  await expect(page.locator('#hmrcSetupCards [data-hmrc-open="registration"]')).toHaveCount(0);
  await expect(page.locator('#hmrcSetupCount')).toHaveText('1 of 2 recorded');
});

test('@mobile HMRC summary does not overflow a phone viewport', async ({ page }) => {
  await mockCompanyWorkspace(page, 'editor', {
    companyName: 'Mobile SPV Ltd',
    hmrc: {
      status: 'active', setup: { activityStage: 'active', registrationConfirmedOn: '2026-02-04' },
      periods: [{ status: 'active', periodStart: '2026-01-01', periodEnd: '2026-12-31' }],
      records: [{ periodEnd: '2026-12-31', liability: 2400, paymentReference: '12345678901234567',
        payments: [{ id: 'payment-12345678', date: '2027-02-02', amount: 500, reference: 'Bank' }] }]
    }
  });
  await page.goto('/company/details.html?company=default');
  await page.getByRole('tab', { name: 'Compliance' }).click();
  await page.locator('#hmrcRecurringViewTab').click();
  await expect(page.locator('#hmrcPeriodHistory')).toContainText('£1,900.00');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(overflow).toBe(false);
  await page.locator('#hmrcPeriodHistory [data-hmrc-open="payment"]').click();
  await expect(page.locator('#hmrcPaymentDialog')).toBeVisible();
});

test('viewer cannot change HMRC tax records', async ({ page }) => {
  await mockCompanyWorkspace(page, 'viewer', {
    companyName: 'Read Only HMRC Ltd',
    hmrc: {
      status: 'active', setup: { activityStage: 'active', registrationConfirmedOn: '2026-03-04' },
      periods: [{ status: 'active', periodStart: '2026-01-01', periodEnd: '2026-12-31' }]
    }
  });
  await page.goto('/company/details.html?company=default');
  await page.getByRole('tab', { name: 'Compliance' }).click();
  await expect(page.locator('#hmrcSetupCards [data-hmrc-open="utr"]')).toBeDisabled();
  await page.locator('#hmrcRecurringViewTab').click();
  await expect(page.locator('#hmrcOpenPeriodDialog')).toBeDisabled();
  await expect(page.locator('#hmrcPeriodHistory [data-hmrc-open="filing"]')).toBeDisabled();
  await expect(page.locator('#hmrcPeriodHistory [data-hmrc-open="payment"]')).toBeDisabled();
});

test('@mobile HMRC dialogs use themed, full-size date and form controls', async ({ page }) => {
  await mockCompanyWorkspace(page, 'editor', {
    companyName: 'HMRC Styling SPV',
    hmrc: {
      status: 'active',
      setup: { utrReceivedOn: '2026-02-04', activityStage: 'active', registrationConfirmedOn: '2026-02-06' },
      periods: [{ status: 'active', periodStart: '2026-01-01', periodEnd: '2026-12-31' }]
    }
  });
  await page.goto('/company/details.html?company=default');
  await page.getByRole('tab', { name: 'Compliance' }).click();
  await page.locator('#hmrcSetupViewTab').click();
  await expect(page.locator('#hmrcSetupOverview')).toBeVisible();
  // Use the same accessible pencil icon as the rest of the Company page.
  for (const [step, label] of [
    ['utr', 'Edit UTR letter'],
    ['activity', 'Edit company activity'],
    ['registration', 'Edit Corporation Tax registration']
  ]) {
    const edit = page.locator('#hmrcSetupCards [data-hmrc-open="' + step + '"]');
    await expect(edit).toHaveAttribute('aria-label', label);
    await expect(edit.locator('svg')).toHaveCount(1);
    await expect(edit).not.toContainText('Edit');
  }

  const checkControls = async (dialogId, controls) => {
    const dialog = page.locator('#' + dialogId);
    await expect(dialog).toBeVisible();
    for (const id of controls) {
      const field = page.locator('#' + id);
      await expect(field).toBeVisible();
      const style = await field.evaluate((element) => {
        const css = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          height: rect.height, width: rect.width, parentWidth: element.parentElement.getBoundingClientRect().width,
          left: rect.left, right: rect.right,
          parentLeft: element.parentElement.getBoundingClientRect().left,
          parentRight: element.parentElement.getBoundingClientRect().right,
          dialogRight: element.closest('dialog').getBoundingClientRect().right,
          radius: parseFloat(css.borderTopLeftRadius), background: css.backgroundColor, borderWidth: parseFloat(css.borderTopWidth),
          fontSize: parseFloat(css.fontSize)
        };
      });
      expect(style.height, id + ' height').toBeGreaterThanOrEqual(46);
      expect(style.radius, id + ' radius').toBeGreaterThanOrEqual(10);
      expect(style.borderWidth, id + ' border').toBeGreaterThanOrEqual(1);
      expect(style.fontSize, id + ' font').toBeGreaterThanOrEqual(16);
      expect(style.width, id + ' width').toBeGreaterThan(100);
      expect(style.width, id + ' width containment').toBeLessThanOrEqual(style.parentWidth + 2);
      expect(style.left, id + ' left containment').toBeGreaterThanOrEqual(style.parentLeft - 1);
      expect(style.right, id + ' right containment').toBeLessThanOrEqual(style.parentRight + 1);
      expect(style.right, id + ' dialog containment').toBeLessThanOrEqual(style.dialogRight - 12);
      expect(style.background, id + ' background').not.toBe('rgba(0, 0, 0, 0)');
    }
    await dialog.locator('[data-hmrc-close]').click();
    await expect(dialog).toBeHidden();
  };

  await page.locator('#hmrcSetupCards [data-hmrc-open="utr"]').click();
  await checkControls('hmrcSetupDialog', ['hmrcUtrReceivedOn']);
  await page.locator('#hmrcSetupCards [data-hmrc-open="registration"]').click();
  await checkControls('hmrcSetupDialog', ['hmrcRegistrationConfirmedOn', 'hmrcRegistrationReference']);

  await page.locator('#hmrcRecurringViewTab').click();
  await page.locator('#hmrcOpenPeriodDialog').click();
  await checkControls('hmrcPeriodDialog', ['hmrcPeriodStart', 'hmrcPeriodEnd']);
  await page.locator('#hmrcPeriodHistory [data-hmrc-open="filing"]').click();
  await checkControls('hmrcFilingDialog', ['hmrcFiledOn', 'hmrcReviewedOn', 'hmrcLiability', 'hmrcLiabilityStatus']);
  const filingFields = await page.locator('#hmrcFilingForm label:has(input[type="date"])').count();
  expect(filingFields).toBe(2);
  await page.locator('#hmrcPeriodHistory [data-hmrc-open="payment"]').click();
  await checkControls('hmrcPaymentDialog', ['hmrcPaymentDate', 'hmrcPaymentAmount', 'hmrcPaymentMethod']);

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.locator('#hmrcPeriodHistory [data-hmrc-open="payment"]').click();
  await checkControls('hmrcPaymentDialog', ['hmrcPaymentDate', 'hmrcPaymentAmount']);
});
