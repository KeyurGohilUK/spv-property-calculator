/**
 * Company-level compliance catalogue and deadline projection.
 * Public data is not evidence that HMRC obligations or identity checks are complete.
 * This module is deliberately pure so UI, reminders and sync can share the rules.
 */
export const COMPANY_COMPLIANCE_RULES = Object.freeze([
  { id: 'confirmation-statement', title: 'Confirmation statement', source: 'companies-house', recurring: true },
  { id: 'annual-accounts', title: 'Annual company accounts', source: 'companies-house', recurring: true },
  { id: 'corporation-tax-registration', title: 'Corporation Tax registration', source: 'manual', recurring: false },
  { id: 'corporation-tax-return', title: 'Corporation Tax return', source: 'hmrc', recurring: true },
  { id: 'corporation-tax-payment', title: 'Corporation Tax payment (if due)', source: 'hmrc', recurring: true, conditional: true },
  { id: 'director-identity', title: 'Director identity verification', source: 'manual', recurring: false },
  { id: 'psc-identity', title: 'PSC identity verification', source: 'manual', recurring: false },
  { id: 'statutory-registers', title: 'Company statutory records', source: 'manual', recurring: false },
  { id: 'accounting-records', title: 'Accounting records', source: 'manual', recurring: false },
  { id: 'company-changes', title: 'Report changes to company information', source: 'manual', recurring: false, conditional: true },
  { id: 'ico-fee', title: 'ICO registration or exemption assessment', source: 'manual', recurring: false, conditional: true },
  { id: 'paye', title: 'PAYE obligations', source: 'manual', recurring: true, conditional: true },
  { id: 'vat', title: 'VAT registration and returns', source: 'manual', recurring: true, conditional: true },
  { id: 'director-loans', title: 'Director loan accounting and disclosures', source: 'manual', recurring: true, conditional: true }
]);

export function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function daysUntil(dueDate, today) {
  if (!validDate(dueDate) || !validDate(today)) return null;
  return Math.round((Date.parse(dueDate + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
}

export function normalizeConfirmation(value) {
  if (!value || typeof value !== 'object') return null;
  if (!['confirmed', 'not-applicable'].includes(value.status) || !validDate(value.confirmedOn)) return null;
  return { status: value.status, confirmedOn: value.confirmedOn, period: String(value.period || '') };
}

/**
 * Accept only public Companies House deadline fields. Never interpret a public
 * filing date as confirmation of a tax payment or director verification.
 */
export function companyHouseDeadlines(company = {}) {
  const nextAccounts = company.accounts?.next_accounts?.due_on || company.accounts?.next_due;
  const nextStatement = company.confirmation_statement?.next_due;
  return {
    'annual-accounts': validDate(nextAccounts) ? nextAccounts : null,
    'confirmation-statement': validDate(nextStatement) ? nextStatement : null
  };
}

/**
 * Each recurring item is keyed by its due-date period so last year's confirmation
 * never marks the next year's filing complete.
 */
export function companyHouseFilingInfo(company = {}, id) {
  if (id === 'annual-accounts') {
    const date = company.accounts?.last_accounts?.made_up_to || company.accounts?.last_accounts?.period_end_on;
    return { lastPeriod: validDate(date) ? date : null, overdue: company.accounts?.overdue === true };
  }
  if (id === 'confirmation-statement') {
    const date = company.confirmation_statement?.last_made_up_to;
    return { lastPeriod: validDate(date) ? date : null, overdue: company.confirmation_statement?.overdue === true };
  }
  return null;
}

export function buildCompanyCompliance({ company = {}, confirmations = {}, today, enabledConditional = [] } = {}) {
  if (!validDate(today)) throw new Error('A valid current date is required.');
  const deadlineMap = companyHouseDeadlines(company);
  const enabled = new Set(enabledConditional);
  return COMPANY_COMPLIANCE_RULES
    .filter((rule) => !rule.conditional || enabled.has(rule.id))
    .map((rule) => {
      const dueDate = deadlineMap[rule.id] ?? null;
      const officialFiling = rule.source === 'companies-house' ? companyHouseFilingInfo(company, rule.id) : null;
      const period = rule.recurring ? dueDate || 'unconfirmed-period' : 'once';
      const key = rule.id + ':' + period;
      const confirmation = normalizeConfirmation(confirmations[key]);
      const remaining = dueDate ? daysUntil(dueDate, today) : null;
      let status = 'needs-verification';
      if (officialFiling?.overdue) status = 'past-deadline-unverified';
      else if (rule.source !== 'companies-house' && confirmation?.status === 'not-applicable' && rule.conditional) status = 'not-applicable';
      else if (rule.source !== 'companies-house' && confirmation?.status === 'confirmed') status = 'user-confirmed';
      else if (remaining !== null && remaining < 0) status = 'past-deadline-unverified';
      else if (remaining !== null && remaining <= 30) status = 'due-soon';
      else if (remaining !== null) status = 'upcoming';
      return { ...rule, key, period, dueDate, daysRemaining: remaining, status, confirmation: rule.source === 'companies-house' ? null : confirmation, officialFiling };
    });
}
