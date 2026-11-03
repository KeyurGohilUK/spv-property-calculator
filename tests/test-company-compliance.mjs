import assert from 'node:assert/strict';
import {
  COMPANY_COMPLIANCE_RULES, validDate, daysUntil, companyHouseDeadlines,
  buildCompanyCompliance, normalizeConfirmation, filingReminder, formatComplianceDateUK, hmrcDeadlines, addMonthsClamped
} from '../src/features/company/compliance-rules.js';

assert.equal(formatComplianceDateUK('2027-11-02'), '2 Nov 2027');
assert.equal(formatComplianceDateUK('2028-07-20'), '20 Jul 2028');
assert.equal(formatComplianceDateUK('invalid'), '');
for (const [days, windowDays] of [[30, 30], [29, 30], [14, 14], [13, 14], [7, 7], [1, 7], [0, 7]]) {
  assert.equal(filingReminder(days).windowDays, windowDays);
}
for (const days of [-1, 31, null, undefined]) assert.equal(filingReminder(days), null);
assert.equal(filingReminder(0).message, 'Due today');
assert.equal(COMPANY_COMPLIANCE_RULES.length, 14);
assert.equal(new Set(COMPANY_COMPLIANCE_RULES.map((r) => r.id)).size, COMPANY_COMPLIANCE_RULES.length);
assert.equal(validDate('2026-02-29'), false);
assert.equal(validDate('2028-02-29'), true);
assert.equal(validDate('2026-13-01'), false);
assert.equal(daysUntil('2026-11-02', '2026-11-02'), 0);
assert.equal(daysUntil('2026-11-01', '2026-11-02'), -1);
assert.equal(daysUntil('bad', '2026-11-02'), null);
assert.deepEqual(companyHouseDeadlines({}), { 'annual-accounts': null, 'confirmation-statement': null });

const company = {
  accounts: { next_due: '2027-07-31' },
  confirmation_statement: { next_due: '2026-11-16' }
};
const base = buildCompanyCompliance({ company, today: '2026-11-02' });
assert.equal(base.length, 8, 'Conditional items must not appear before applicability is known');
assert.equal(base.find((r) => r.id === 'confirmation-statement').status, 'due-soon');
assert.equal(base.find((r) => r.id === 'confirmation-statement').reminder.windowDays, 14);
assert.equal(base.find((r) => r.id === 'annual-accounts').reminder, null);
assert.equal(base.find((r) => r.id === 'confirmation-statement').daysRemaining, 14);
assert.equal(base.find((r) => r.id === 'annual-accounts').status, 'upcoming');
assert.equal(base.find((r) => r.id === 'corporation-tax-return').dueDate, null,
  'No tax dates should be guessed from Companies House financial dates');
assert.equal(base.find((r) => r.id === 'director-identity').status, 'needs-verification');

const filing = base.find((r) => r.id === 'confirmation-statement');
const confirmed = buildCompanyCompliance({
  company, today: '2026-11-02',
  confirmations: { [filing.key]: { status: 'confirmed', confirmedOn: '2026-10-30' } }
});
assert.equal(confirmed.find((r) => r.id === 'confirmation-statement').status, 'due-soon', 'Manual confirmations must not override Companies House filing status');
assert.equal(confirmed.find((r) => r.id === 'annual-accounts').status, 'upcoming');

const nextCycle = buildCompanyCompliance({
  company: { ...company, confirmation_statement: { next_due: '2027-11-16' } },
  today: '2026-11-02',
  confirmations: { [filing.key]: { status: 'confirmed', confirmedOn: '2026-10-30' } }
});
assert.equal(nextCycle.find((r) => r.id === 'confirmation-statement').status, 'upcoming',
  'Previous cycle evidence must not complete a new filing period');
assert.equal(buildCompanyCompliance({ company, today: '2026-11-17' })
  .find((r) => r.id === 'confirmation-statement').status, 'past-deadline-unverified');
assert.equal(buildCompanyCompliance({ company, today: '2026-11-17' })
  .find((r) => r.id === 'confirmation-statement').status === 'overdue', false,
  'Missing evidence must not assert that filing was missed');

const conditional = buildCompanyCompliance({
  today: '2026-11-02', enabledConditional: ['ico-fee', 'director-loans'],
  confirmations: { 'ico-fee:once': { status: 'not-applicable', confirmedOn: '2026-11-02' } }
});
assert.equal(conditional.length, 10);
assert.equal(conditional.find((r) => r.id === 'ico-fee').status, 'not-applicable');
assert.equal(normalizeConfirmation({ status: 'confirmed', confirmedOn: 'not-date' }), null);
assert.throws(() => buildCompanyCompliance({ today: 'yesterday' }), /valid current date/);
console.log('Company compliance catalogue, date, applicability and evidence checks passed.');

assert.equal(addMonthsClamped('2026-01-31', 1), '2026-02-28');
assert.deepEqual(hmrcDeadlines({ status: 'unknown', periodStart: '2026-01-01', periodEnd: '2026-12-31' }), {});
assert.deepEqual(hmrcDeadlines({ status: 'dormant', periodStart: '2026-01-01', periodEnd: '2026-12-31' }), {});
assert.deepEqual(hmrcDeadlines({ status: 'active', periodStart: '', periodEnd: '' }), {});
assert.deepEqual(hmrcDeadlines({ status: 'active', periodStart: '2026-12-31', periodEnd: '2026-01-01' }), {});
assert.deepEqual(hmrcDeadlines({ status: 'active', periodStart: '2026-01-01', periodEnd: '2027-02-01' }), {});
const hmrcDates = hmrcDeadlines({ status: 'active', periodStart: '2026-01-01', periodEnd: '2026-12-31' });
assert.equal(hmrcDates['corporation-tax-registration'], '2026-04-01');
assert.equal(hmrcDates['corporation-tax-payment'], '2027-10-01');
assert.equal(hmrcDates['corporation-tax-return'], '2027-12-31');
const hmrcCycle = buildCompanyCompliance({
  today: '2027-09-15', hmrc: { status: 'active', periodStart: '2026-01-01', periodEnd: '2026-12-31' },
  enabledConditional: ['corporation-tax-payment']
});
assert.equal(hmrcCycle.find((item) => item.id === 'corporation-tax-payment').status, 'due-soon');
assert.equal(hmrcCycle.find((item) => item.id === 'corporation-tax-return').period, '2026-12-31');
assert.equal(hmrcCycle.find((item) => item.id === 'corporation-tax-return').dueDate, '2027-12-31');
