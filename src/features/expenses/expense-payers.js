import { getCompanyProfile } from '../company/company-storage.js';

const LEGACY_PAYER_LABELS = Object.freeze({
  'director-a': 'Director A (personal funds)',
  'director-b': 'Director B (personal funds)',
  unrecorded: 'Not recorded'
});

export function normalizeExpensePayer(value) {
  const payer = String(value || 'unrecorded');
  return payer === 'company' || Object.hasOwn(LEGACY_PAYER_LABELS, payer)
    || /^appointment:[A-Za-z0-9_-]{1,160}$/.test(payer)
    ? payer
    : 'unrecorded';
}

export function getExpensePayerOptions(profile = getCompanyProfile()) {
  const companyName = String(profile?.companyName || '').trim();
  const options = [{
    value: 'company',
    label: companyName ? `Paid by company · ${companyName}` : 'Paid by company'
  }];
  (Array.isArray(profile?.appointments) ? profile.appointments : []).forEach((person) => {
    const id = String(person?.id || '').trim();
    const name = String(person?.name || '').trim();
    if (!id || !name || !Array.isArray(person.roles) || !person.roles.length) return;
    const roles = person.roles.map((role) => ({
      director: 'Director', shareholder: 'Shareholder', secretary: 'Secretary', psc: 'PSC'
    }[role])).filter(Boolean);
    options.push({
      value: `appointment:${id}`,
      label: roles.length ? `${name} · ${roles.join(', ')}` : name
    });
  });
  return options;
}

export function getExpensePayerLabel(value, profile = getCompanyProfile()) {
  const payer = normalizeExpensePayer(value);
  if (payer === 'company') {
    return profile?.companyName ? `Company · ${profile.companyName}` : 'Company';
  }
  if (payer.startsWith('appointment:')) {
    const appointmentId = payer.slice('appointment:'.length);
    const person = profile?.appointments?.find((item) => String(item.id) === appointmentId);
    return person?.name || 'Previous appointment';
  }
  if (payer === 'director-a' || payer === 'director-b') {
    const directors = (profile?.appointments || []).filter((person) => person.roles?.includes('director'));
    const person = directors[payer === 'director-a' ? 0 : 1];
    return person?.name || LEGACY_PAYER_LABELS[payer];
  }
  return LEGACY_PAYER_LABELS[payer] || LEGACY_PAYER_LABELS.unrecorded;
}
