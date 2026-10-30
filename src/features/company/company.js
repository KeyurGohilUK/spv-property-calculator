import { setupDialog } from '../../components/dialog-helper.js';
import { escapeHtml, formatDate } from '../../utils/format-utils.js';
import { syncCompanyProfile } from './company-cloud-sync.js';
import {
  getCompanyProfile,
  saveCompanyProfile,
  saveAppointment,
  deleteAppointment,
  saveInvestment,
  deleteInvestment,
  getInvestmentSummary,
  INVESTMENT_MEMBER_ROLES
} from './company-storage.js';

const $ = (id) => document.getElementById(id);
const CURRENCY_FORMAT = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const ROLE_LABELS = Object.freeze({
  director: 'Director', shareholder: 'Shareholder', secretary: 'Secretary', psc: 'PSC'
});
let profile = getCompanyProfile();
let editingAllowed = true;

const detailsDialog = setupDialog($('companyDetailsDialog'), {
  closeButtons: [$('closeCompanyDetailsDialog'), $('cancelCompanyDetailsBtn')]
});
const appointmentDialog = setupDialog($('appointmentDialog'), {
  closeButtons: [$('closeAppointmentDialog'), $('cancelAppointmentBtn')]
});
const investmentDialog = setupDialog($('investmentDialog'), {
  closeButtons: [$('closeInvestmentDialog'), $('cancelInvestmentBtn')]
});

function roleMark(appointment, role) {
  return appointment.roles.includes(role)
    ? '<span class="company-role-mark" role="img" aria-label="Yes">✓</span>'
    : '<span class="company-role-none" role="img" aria-label="No">—</span>';
}

function setSyncStatus(message, state = '') {
  const status = $('companySyncStatus');
  status.textContent = message;
  status.classList.toggle('error', state === 'error');
  status.classList.toggle('synced', state === 'synced');
}

function renderAppointments() {
  const empty = profile.appointments.length === 0;
  $('companyAppointmentsEmpty').classList.toggle('hidden', !empty);
  $('companyAppointmentsTable').classList.toggle('hidden', empty);
  $('companyAppointmentCards').classList.toggle('hidden', empty);
  $('companyAppointmentsRows').innerHTML = profile.appointments.map((appointment) => `
    <tr>
      <th scope="row">${escapeHtml(appointment.name)}</th>
      <td>${roleMark(appointment, 'director')}</td>
      <td>${roleMark(appointment, 'shareholder')}</td>
      <td>${roleMark(appointment, 'secretary')}</td>
      <td>${roleMark(appointment, 'psc')}</td>
      <td><button class="secondary-btn compact-company-btn" type="button" data-edit-appointment="${escapeHtml(appointment.id)}" ${editingAllowed ? '' : 'disabled'}>Edit</button></td>
    </tr>`).join('');
  $('companyAppointmentCards').innerHTML = profile.appointments.map((appointment) => `
    <article class="company-appointment-card">
      <div class="company-appointment-card-heading"><h3>${escapeHtml(appointment.name)}</h3><button class="secondary-btn compact-company-btn" type="button" data-edit-appointment="${escapeHtml(appointment.id)}" ${editingAllowed ? '' : 'disabled'}>Edit</button></div>
      <ul class="company-role-chips">${appointment.roles.map((role) => `<li>${escapeHtml(ROLE_LABELS[role])}</li>`).join('')}</ul>
    </article>`).join('');
  document.querySelectorAll('[data-edit-appointment]').forEach((button) => {
    button.addEventListener('click', () => openAppointment(button.dataset.editAppointment));
  });
}


function eligibleInvestmentMembers() {
  return profile.appointments.filter((appointment) =>
    appointment.roles.some((role) => INVESTMENT_MEMBER_ROLES.includes(role))
  );
}

function memberName(memberId, fallback = '') {
  return profile.appointments.find((appointment) => appointment.id === memberId)?.name || fallback || 'Former member';
}

function renderInvestments() {
  const investments = profile.investments || [];
  const empty = investments.length === 0;
  const members = eligibleInvestmentMembers();
  const summary = getInvestmentSummary(profile);
  $('companyInvestmentsEmpty').classList.toggle('hidden', !summary.members.length);
  $('companyInvestmentSummaryWrap').classList.toggle('hidden', !summary.members.length);
  $('companyInvestmentsEntriesEmpty').classList.toggle('hidden', empty);
  $('companyInvestmentEntriesWrap').classList.toggle('hidden', empty);
  $('addInvestmentBtn').disabled = !editingAllowed || members.length === 0;
  $('addInvestmentBtn').title = members.length ? '' : 'Add a director or shareholder appointment first';
  $('companyInvestmentSummaryRows').innerHTML = summary.members.map((member) => `
    <tr>
      <th scope="row">${escapeHtml(memberName(member.memberId, member.memberName))}</th>
      <td>${CURRENCY_FORMAT.format(member.amount)}</td>
      <td>${member.contributionPercentage.toFixed(2)}%</td>
    </tr>`).join('');
  $('companyInvestmentTotal').textContent = CURRENCY_FORMAT.format(summary.total);
  $('companyInvestmentEntryRows').innerHTML = [...investments].sort((a, b) =>
    String(b.date).localeCompare(String(a.date))
  ).map((investment) => `
    <tr>
      <td>${escapeHtml(investment.date ? formatDate(`${investment.date}T00:00:00`, { day: 'numeric', month: 'short', year: 'numeric' }, investment.date) : 'Date not recorded')}</td>
      <th scope="row">${escapeHtml(memberName(investment.memberId, investment.memberName))}</th>
      <td>${CURRENCY_FORMAT.format(investment.amount)}</td>
      <td class="company-investment-reference">${escapeHtml(investment.reference || '—')}</td>
      <td><button class="secondary-btn compact-company-btn" type="button" data-edit-investment="${escapeHtml(investment.id)}" ${editingAllowed ? '' : 'disabled'}>Edit</button></td>
    </tr>`).join('');
  document.querySelectorAll('[data-edit-investment]').forEach((button) => {
    button.addEventListener('click', () => openInvestment(button.dataset.editInvestment));
  });
}

function currentDateInputValue() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

function openInvestment(id = '') {
  const investment = profile.investments.find((item) => item.id === id);
  const members = eligibleInvestmentMembers();
  const selectedMemberId = investment?.memberId || members[0]?.id || '';
  const selectedIsCurrent = members.some((item) => item.id === selectedMemberId);
  const options = members.map((member) => `<option value="${escapeHtml(member.id)}" ${member.id === selectedMemberId ? 'selected' : ''}>${escapeHtml(member.name)}</option>`);
  if (investment && !selectedIsCurrent) {
    options.unshift(`<option value="${escapeHtml(investment.memberId)}" selected>${escapeHtml(memberName(investment.memberId, investment.memberName))} (former member)</option>`);
  }
  $('investmentMemberInput').innerHTML = options.join('');
  $('investmentMemberInput').disabled = !members.length && !investment;
  $('investmentIdInput').value = investment?.id || '';
  $('investmentAmountInput').value = investment?.amount ?? '';
  $('investmentDateInput').value = investment?.date || currentDateInputValue();
  $('investmentReferenceInput').value = investment?.reference || '';
  $('investmentDialogTitle').textContent = investment ? 'Edit investment' : 'Add investment';
  $('deleteInvestmentBtn').classList.toggle('hidden', !investment);
  $('investmentMessage').textContent = '';
  const trigger = investment
    ? [...document.querySelectorAll('[data-edit-investment]')].find((button) => button.dataset.editInvestment === id)
    : $('addInvestmentBtn');
  investmentDialog.open(trigger || document.activeElement);
}

function renderProfile() {
  profile = getCompanyProfile();
  $('companyNameValue').textContent = profile.companyName || 'Not added';
  $('companyNumberValue').textContent = profile.companyNumber || 'Not recorded';
  $('companyOfficeValue').textContent = profile.registeredOffice || 'Not recorded';
  $('companyStatusValue').textContent = profile.companyStatus || 'Not recorded';
  $('companyDateValue').textContent = profile.incorporationDate
    ? formatDate(`${profile.incorporationDate}T00:00:00`, { day: 'numeric', month: 'long', year: 'numeric' }, 'Not recorded')
    : 'Not recorded';
  $('companyEmptyHint').classList.toggle('hidden', Boolean(profile.companyName));
  $('editCompanyDetailsBtn').disabled = !editingAllowed;
  $('addAppointmentBtn').disabled = !editingAllowed;
  renderAppointments();
  renderInvestments();
}

function showDetailsDialog() {
  $('companyNameInput').value = profile.companyName;
  $('companyNumberInput').value = profile.companyNumber;
  $('companyOfficeInput').value = profile.registeredOffice;
  $('companyStatusInput').value = profile.companyStatus;
  $('companyDateInput').value = profile.incorporationDate;
  $('companyDetailsMessage').textContent = '';
  detailsDialog.open($('editCompanyDetailsBtn'));
}

function openAppointment(id = '') {
  const appointment = profile.appointments.find((item) => item.id === id);
  $('appointmentIdInput').value = appointment?.id || '';
  $('appointmentNameInput').value = appointment?.name || '';
  document.querySelectorAll('[data-appointment-role]').forEach((checkbox) => {
    checkbox.checked = Boolean(appointment?.roles.includes(checkbox.value));
  });
  $('appointmentDialogTitle').textContent = appointment ? 'Edit person' : 'Add person';
  $('deleteAppointmentBtn').classList.toggle('hidden', !appointment);
  $('appointmentMessage').textContent = '';
  const trigger = appointment
    ? [...document.querySelectorAll('[data-edit-appointment]')].find((button) => button.dataset.editAppointment === id)
    : $('addAppointmentBtn');
  appointmentDialog.open(trigger || document.activeElement);
}

async function syncAfterSave() {
  if (!navigator.onLine || !window.SPVCloud?.getCurrentUser?.()) {
    setSyncStatus(profile._cloudDirty ? 'Saved on this device · sync pending' : 'Saved on this device');
    return;
  }
  setSyncStatus('Syncing company details…');
  try {
    const result = await syncCompanyProfile(window.SPVCloud);
    window.dispatchEvent(new CustomEvent('spv-workspace-synced'));
    if (result.conflicts.length) setSyncStatus('Sync conflict · local changes kept', 'error');
    else setSyncStatus('Company details synced', 'synced');
  } catch (error) {
    console.warn('Company profile sync failed:', error);
    setSyncStatus('Saved on this device · sync pending', 'error');
  }
}

$('editCompanyDetailsBtn').addEventListener('click', showDetailsDialog);
$('addAppointmentBtn').addEventListener('click', () => openAppointment());
$('addInvestmentBtn').addEventListener('click', () => openInvestment());

$('companyDetailsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editingAllowed) return;
  try {
    profile = saveCompanyProfile({
      ...profile,
      companyName: $('companyNameInput').value,
      companyNumber: $('companyNumberInput').value,
      registeredOffice: $('companyOfficeInput').value,
      companyStatus: $('companyStatusInput').value,
      incorporationDate: $('companyDateInput').value
    });
    renderProfile();
    detailsDialog.close();
    await syncAfterSave();
  } catch (error) {
    $('companyDetailsMessage').textContent = error.message || 'Company details could not be saved.';
  }
});

$('appointmentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editingAllowed) return;
  const roles = [...document.querySelectorAll('[data-appointment-role]:checked')].map((checkbox) => checkbox.value);
  try {
    profile = saveAppointment({ id: $('appointmentIdInput').value, name: $('appointmentNameInput').value, roles });
    renderProfile();
    appointmentDialog.close();
    await syncAfterSave();
  } catch (error) {
    $('appointmentMessage').textContent = error.message || 'This person could not be saved.';
  }
});


$('investmentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editingAllowed) return;
  try {
    profile = saveInvestment({
      id: $('investmentIdInput').value,
      memberId: $('investmentMemberInput').value,
      amount: $('investmentAmountInput').value,
      date: $('investmentDateInput').value,
      reference: $('investmentReferenceInput').value
    });
    renderProfile();
    investmentDialog.close();
    await syncAfterSave();
  } catch (error) {
    $('investmentMessage').textContent = error.message || 'This investment could not be saved.';
  }
});

$('deleteInvestmentBtn').addEventListener('click', async () => {
  if (!editingAllowed) return;
  const id = $('investmentIdInput').value;
  const investment = profile.investments.find((item) => item.id === id);
  if (!investment || !window.confirm(`Remove this ${CURRENCY_FORMAT.format(investment.amount)} investment entry?`)) return;
  deleteInvestment(id);
  renderProfile();
  investmentDialog.close();
  await syncAfterSave();
});

$('deleteAppointmentBtn').addEventListener('click', async () => {
  if (!editingAllowed) return;
  const id = $('appointmentIdInput').value;
  const appointment = profile.appointments.find((item) => item.id === id);
  if (!appointment || !window.confirm(`Remove ${appointment.name} from the company appointments?`)) return;
  deleteAppointment(id);
  renderProfile();
  appointmentDialog.close();
  await syncAfterSave();
});

window.addEventListener('spv-workspace-synced', () => {
  renderProfile();
  if (!profile._cloudDirty) setSyncStatus('Company details synced', 'synced');
});
window.addEventListener('online', async () => {
  if (profile._cloudDirty) await syncAfterSave();
});

async function initialiseCompanyPage() {
  renderProfile();
  try {
    const state = await window.SPVCloud?.init?.();
    if (!state?.user) return;
    const access = await window.SPVCloud.getWorkspaceAccess();
    if (!access?.active || access.role === 'viewer') {
      editingAllowed = false;
      $('companySyncStatus').textContent = 'View-only · ask a workspace editor to make changes';
      $('companySyncStatus').classList.remove('error', 'synced');
      renderProfile();
    }
  } catch (error) {
    if (navigator.onLine) console.warn('Company access could not be verified:', error);
  }
}

initialiseCompanyPage();
