import { COMPANY_COMPLIANCE_RULES, validDate, normalizeConfirmation } from './compliance-rules.js';
const VALID_RULE_IDS = new Set(COMPANY_COMPLIANCE_RULES.map((rule) => rule.id));
const COMPANY_STORAGE_KEY = 'spv-property-calculator.company-profile.v1';
const COMPANY_INDEX_KEY = 'spv-property-calculator.company-ids.v1';
const SELECTED_COMPANY_KEY = 'spv-property-calculator.selected-company.v1';
const validCompanyId = (id) => id === 'default' || /^company-[A-Za-z0-9_-]{8,80}$/.test(String(id || ''));
export function getActiveCompanyId() {
  try {
    const id = sessionStorage.getItem(SELECTED_COMPANY_KEY);
    return validCompanyId(id) ? id : 'default';
  } catch { return 'default'; }
}
export function setActiveCompanyId(id) {
  if (!validCompanyId(id)) throw new Error('Invalid company selection.');
  try { sessionStorage.setItem(SELECTED_COMPANY_KEY, id); } catch { /* session storage may be blocked */ }
  return id;
}
export function newCompanyId() {
  return 'company-' + (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
}
function profileStorageKey(id) {
  return id === 'default' ? COMPANY_STORAGE_KEY : `${COMPANY_STORAGE_KEY}:${id}`;
}
function storedCompanyIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(COMPANY_INDEX_KEY) || '[]');
    return Array.isArray(ids) ? [...new Set(['default', ...ids.filter(validCompanyId)])] : ['default'];
  } catch { return ['default']; }
}
export function listAllStoredCompanyProfiles() {
  return storedCompanyIds().map((id) => getStoredCompanyProfile(id)).filter((profile) => profile?.companyName);
}
export function listStoredCompanyProfiles() {
  return listAllStoredCompanyProfiles().filter((profile) => !profile.deletedAt);
}

const APPOINTMENT_ROLES = Object.freeze(['director', 'shareholder', 'secretary', 'psc']);
const INVESTMENT_MEMBER_ROLES = Object.freeze(['director', 'shareholder']);

function makeId(prefix = 'appointment') {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyProfile(id = 'default') {
  return {
    id, companyName: '', companyNumber: '', registeredOffice: '',
    incorporationDate: '', companyStatus: '', appointments: [], investments: [], complianceConfirmations: {}, deletedAt: null, _cloudRevision: 0, _cloudDirty: false
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

function normalizeInvestment(item = {}) {
  const amount = Math.round(Number(item.amount) * 100) / 100;
  return {
    id: String(item.id || makeId('investment')),
    memberId: String(item.memberId || '').trim().slice(0, 160),
    memberName: String(item.memberName || '').trim().slice(0, 160),
    amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || '')) ? item.date : '',
    reference: String(item.reference || '').trim().slice(0, 500)
  };
}

export function normalizeCompanyProfile(profile = {}) {
  const appointments = Array.isArray(profile.appointments)
    ? profile.appointments.map(normalizeAppointment).filter((item) => item.name && item.roles.length)
    : [];
  const investments = Array.isArray(profile.investments)
    ? profile.investments.map(normalizeInvestment).filter((item) => item.memberId && item.memberName && item.amount > 0)
    : [];
  return {
    ...emptyProfile(),
    ...profile,
    id: validCompanyId(profile.id) ? profile.id : 'default',
    companyName: String(profile.companyName || '').trim().slice(0, 160),
    companyNumber: String(profile.companyNumber || '').trim().slice(0, 32),
    registeredOffice: String(profile.registeredOffice || '').trim().slice(0, 500),
    incorporationDate: /^\d{4}-\d{2}-\d{2}$/.test(String(profile.incorporationDate || '')) ? profile.incorporationDate : '',
    companyStatus: String(profile.companyStatus || '').trim().slice(0, 80),
    deletedAt: /^\d{4}-\d{2}-\d{2}T/.test(String(profile.deletedAt || '')) ? String(profile.deletedAt) : null,
    appointments,
    investments,
    complianceConfirmations: Object.fromEntries(
      Object.entries(profile.complianceConfirmations && typeof profile.complianceConfirmations === 'object' && !Array.isArray(profile.complianceConfirmations)
        ? profile.complianceConfirmations : {})
        .filter(([key, value]) => VALID_RULE_IDS.has(key.split(':')[0]) && normalizeConfirmation(value))
        .map(([key, value]) => [key, normalizeConfirmation(value)])
    ),
    _cloudRevision: Math.max(0, Number(profile._cloudRevision) || 0),
    _cloudDirty: Boolean(profile._cloudDirty)
  };
}

export function getStoredCompanyProfile(id = getActiveCompanyId()) {
  try {
    const raw = localStorage.getItem(profileStorageKey(id));
    return raw ? normalizeCompanyProfile(JSON.parse(raw)) : null;
  } catch (error) {
    console.warn('Could not read company details:', error);
    return null;
  }
}

export function getCompanyProfile(id = getActiveCompanyId()) {
  return getStoredCompanyProfile(id) || emptyProfile(id);
}

function writeProfile(profile) {
  try {
    if (!validCompanyId(profile.id)) return false;
    localStorage.setItem(profileStorageKey(profile.id), JSON.stringify(profile));
    if (profile.id !== 'default') {
      const ids = storedCompanyIds();
      if (!ids.includes(profile.id)) localStorage.setItem(COMPANY_INDEX_KEY, JSON.stringify([...ids, profile.id]));
    }
    return true;
  } catch (error) {
    console.error('Could not save company details:', error);
    return false;
  }
}

export function saveCompanyProfile(profile) {
  const existing = getCompanyProfile();
  if (existing.deletedAt) throw new Error('This company has been deleted.');
  const next = normalizeCompanyProfile({
    ...existing,
    ...profile,
    id: existing.id,
    _cloudRevision: existing._cloudRevision,
    _cloudDirty: true,
    updatedAt: new Date().toISOString()
  });
  if (!next.companyName) throw new Error('Enter the company name.');
  if (!writeProfile(next)) throw new Error('Unable to save company details on this device.');
  return next;
}

/** Mark a company deleted while retaining a versioned tombstone for cross-device sync. */
export function deleteCompanyProfile(id = getActiveCompanyId()) {
  if (!validCompanyId(id)) throw new Error('Invalid company.');
  const existing = getStoredCompanyProfile(id);
  if (!existing?.companyName || existing.deletedAt) throw new Error('Company not available for deletion.');
  const tombstone = normalizeCompanyProfile({
    ...existing,
    deletedAt: new Date().toISOString(),
    _cloudDirty: true,
    updatedAt: new Date().toISOString()
  });
  if (!writeProfile(tombstone)) throw new Error('Unable to record company deletion.');
  return tombstone;
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


export function saveInvestment(investment) {
  const profile = getCompanyProfile();
  const memberId = String(investment.memberId || '').trim();
  const member = profile.appointments.find((item) => item.id === memberId
    && item.roles.some((role) => INVESTMENT_MEMBER_ROLES.includes(role)));
  const existing = profile.investments.find((item) => item.id === String(investment.id || ''));
  if (!member && (!existing || existing.memberId !== memberId)) throw new Error('Select a current director or shareholder.');
  const amount = Math.round(Number(investment.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter an investment amount greater than £0.');
  const date = String(investment.date || '').trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Enter a valid investment date.');
  const normalized = normalizeInvestment({
    ...investment,
    id: investment.id || makeId('investment'),
    memberId,
    memberName: member?.name || existing.memberName,
    amount,
    date,
    reference: investment.reference
  });
  const investments = [...profile.investments];
  const index = investments.findIndex((item) => item.id === normalized.id);
  if (index >= 0) investments[index] = normalized;
  else investments.push(normalized);
  return saveCompanyProfile({ ...profile, investments });
}

export function deleteInvestment(id) {
  const profile = getCompanyProfile();
  const investments = profile.investments.filter((item) => item.id !== String(id));
  if (investments.length === profile.investments.length) return false;
  saveCompanyProfile({ ...profile, investments });
  return true;
}

export function saveComplianceConfirmation(key, confirmed, date) {
  const profile = getCompanyProfile();
  const ruleId = String(key).split(':')[0];
  if (!VALID_RULE_IDS.has(ruleId) || !String(key).startsWith(ruleId + ':')) throw new Error('Unknown compliance requirement.');
  if (confirmed && !validDate(date)) throw new Error('Enter a valid confirmation date.');
  const confirmations = { ...profile.complianceConfirmations };
  if (confirmed) confirmations[key] = { status: 'confirmed', confirmedOn: date, period: String(key).slice(ruleId.length + 1) };
  else delete confirmations[key];
  return saveCompanyProfile({ ...profile, complianceConfirmations: confirmations });
}

export function getInvestmentSummary(profile = getCompanyProfile()) {
  const members = new Map();
  for (const investment of profile.investments || []) {
    const current = members.get(investment.memberId) || {
      memberId: investment.memberId,
      memberName: investment.memberName,
      amount: 0
    };
    current.memberName = investment.memberName || current.memberName;
    current.amount = Math.round((current.amount + Number(investment.amount || 0)) * 100) / 100;
    members.set(investment.memberId, current);
  }
  const total = [...members.values()].reduce((sum, member) => sum + member.amount, 0);
  return {
    total: Math.round(total * 100) / 100,
    members: [...members.values()].map((member) => ({
      ...member,
      contributionPercentage: total > 0 ? member.amount / total * 100 : 0
    }))
  };
}

export function replaceCompanyProfile(profile) {
  const next = normalizeCompanyProfile({ ...profile, _cloudDirty: false });
  if (!writeProfile(next)) throw new Error('Unable to update company details on this device.');
  return next;
}

export { APPOINTMENT_ROLES, INVESTMENT_MEMBER_ROLES };
