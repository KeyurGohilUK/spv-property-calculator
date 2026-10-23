const COMPANY_STORAGE_KEY = 'spv-property-calculator.company-profile.v1';
const APPOINTMENT_ROLES = Object.freeze(['director', 'shareholder', 'secretary', 'psc']);

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `appointment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyProfile() {
  return {
    id: 'default', companyName: '', companyNumber: '', registeredOffice: '',
    incorporationDate: '', companyStatus: '', appointments: [], _cloudRevision: 0, _cloudDirty: false
  };
}

function normalizeAppointment(item = {}) {
  const roles = Array.isArray(item.roles) ? item.roles.filter((role) => APPOINTMENT_ROLES.includes(role)) : [];
  return {
    id: String(item.id || makeId()),
    name: String(item.name || '').trim().slice(0, 160),
    roles: [...new Set(roles)]
  };
}

export function normalizeCompanyProfile(profile = {}) {
  const appointments = Array.isArray(profile.appointments)
    ? profile.appointments.map(normalizeAppointment).filter((item) => item.name && item.roles.length)
    : [];
  return {
    ...emptyProfile(),
    ...profile,
    id: 'default',
    companyName: String(profile.companyName || '').trim().slice(0, 160),
    companyNumber: String(profile.companyNumber || '').trim().slice(0, 32),
    registeredOffice: String(profile.registeredOffice || '').trim().slice(0, 500),
    incorporationDate: /^\d{4}-\d{2}-\d{2}$/.test(String(profile.incorporationDate || '')) ? profile.incorporationDate : '',
    companyStatus: String(profile.companyStatus || '').trim().slice(0, 80),
    appointments,
    _cloudRevision: Math.max(0, Number(profile._cloudRevision) || 0),
    _cloudDirty: Boolean(profile._cloudDirty)
  };
}

export function getStoredCompanyProfile() {
  try {
    const raw = localStorage.getItem(COMPANY_STORAGE_KEY);
    return raw ? normalizeCompanyProfile(JSON.parse(raw)) : null;
  } catch (error) {
    console.warn('Could not read company details:', error);
    return null;
  }
}

export function getCompanyProfile() {
  return getStoredCompanyProfile() || emptyProfile();
}

function writeProfile(profile) {
  try {
    localStorage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(profile));
    return true;
  } catch (error) {
    console.error('Could not save company details:', error);
    return false;
  }
}

export function saveCompanyProfile(profile) {
  const existing = getCompanyProfile();
  const next = normalizeCompanyProfile({
    ...existing,
    ...profile,
    _cloudRevision: existing._cloudRevision,
    _cloudDirty: true,
    updatedAt: new Date().toISOString()
  });
  if (!next.companyName) throw new Error('Enter the company name.');
  if (!writeProfile(next)) throw new Error('Unable to save company details on this device.');
  return next;
}

export function saveAppointment(appointment) {
  const profile = getCompanyProfile();
  const normalized = normalizeAppointment(appointment);
  if (!normalized.name) throw new Error('Enter the officer’s name.');
  if (!normalized.roles.length) throw new Error('Select at least one appointment.');
  const appointments = [...profile.appointments];
  const index = appointments.findIndex((item) => item.id === normalized.id);
  if (index >= 0) appointments[index] = normalized;
  else appointments.push(normalized);
  return saveCompanyProfile({ ...profile, appointments });
}

export function deleteAppointment(id) {
  const profile = getCompanyProfile();
  const appointments = profile.appointments.filter((item) => item.id !== String(id));
  if (appointments.length === profile.appointments.length) return false;
  saveCompanyProfile({ ...profile, appointments });
  return true;
}

export function replaceCompanyProfile(profile) {
  const next = normalizeCompanyProfile({ ...profile, _cloudDirty: false });
  if (!writeProfile(next)) throw new Error('Unable to update company details on this device.');
  return next;
}

export { APPOINTMENT_ROLES };
