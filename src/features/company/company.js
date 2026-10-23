import { setupDialog } from '../../components/dialog-helper.js';
import { escapeHtml, formatDate } from '../../utils/format-utils.js';
import { syncCompanyProfile } from './company-cloud-sync.js';
import {
  getCompanyProfile,
  saveCompanyProfile,
  saveAppointment,
  deleteAppointment
} from './company-storage.js';

const $ = (id) => document.getElementById(id);
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
