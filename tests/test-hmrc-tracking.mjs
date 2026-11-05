import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeHmrcTracking, hmrcPeriodSummary, saveHmrcSetup, saveHmrcPeriodRecord, recordHmrcPayment, updateHmrcPayment, removeHmrcPayment } from '../src/features/company/hmrc-tracking.js';

const period = { status: 'active', periodStart: '2026-01-01', periodEnd: '2026-12-31' };
let hmrc = { status: 'active', periods: [period] };
hmrc = saveHmrcSetup(hmrc, {
  utrReceivedOn: '2026-02-04', registrationConfirmedOn: '2026-03-07',
  registrationReference: 'Letter-1', accountantName: 'Example Accountants'
});
assert.equal(hmrc.setup.utrReceivedOn, '2026-02-04');
assert.equal(hmrc.setup.accountantName, 'Example Accountants');
hmrc = saveHmrcPeriodRecord(hmrc, period.periodEnd, {
  filedOn: '2027-06-10', filingReference: 'CT600-A', liability: 2400,
  liabilityStatus: 'estimated', paymentReference: '12345678901234567',
  reviewedOn: '2027-06-09', reviewedBy: 'Accountant One'
});
assert.equal(hmrcPeriodSummary(hmrc, period.periodEnd).liability, 2400);
assert.equal(hmrcPeriodSummary(hmrc, period.periodEnd).paid, 0);
assert.equal(hmrcPeriodSummary(hmrc, period.periodEnd).liabilityStatus, 'estimated');
assert.equal(hmrcPeriodSummary(hmrc, period.periodEnd).paymentReference, '12345678901234567');
hmrc = recordHmrcPayment(hmrc, period.periodEnd, { id: 'payment-12345678', date: '2027-06-11', amount: 1000.55, reference: 'First instalment' });
hmrc = recordHmrcPayment(hmrc, period.periodEnd, { id: 'payment-87654321', date: '2027-08-11', amount: 999.45, reference: 'Final instalment', method: 'bank-transfer', status: 'hmrc-confirmed' });
assert.equal(hmrcPeriodSummary(hmrc, period.periodEnd).paid, 2000);
assert.equal(hmrcPeriodSummary(hmrc, period.periodEnd).outstanding, 400);
assert.equal(hmrcPeriodSummary(hmrc, period.periodEnd).payments.length, 2);
hmrc = updateHmrcPayment(hmrc, period.periodEnd, { id: 'payment-12345678', date: '2027-06-12', amount: 1000.55, reference: 'Updated instalment', method: 'card', status: 'hmrc-confirmed' });
assert.equal(hmrcPeriodSummary(hmrc, period.periodEnd).payments[0].reference, 'Updated instalment');
assert.equal(hmrcPeriodSummary(hmrc, period.periodEnd).payments[0].method, 'card');
assert.equal(hmrcPeriodSummary(hmrc, period.periodEnd).paid, 2000);
assert.equal(hmrcPeriodSummary(hmrc, period.periodEnd).payments[0].status, 'recorded');
assert.equal(hmrcPeriodSummary(hmrc, period.periodEnd).payments[1].status, 'hmrc-confirmed');
assert.equal(hmrcPeriodSummary(hmrc, period.periodEnd).filedOn, '2027-06-10');
assert.equal(hmrc.setup.utrReceivedOn, '2026-02-04');
assert.throws(() => recordHmrcPayment(hmrc, period.periodEnd, { id: 'payment-12345678', date: '2027-08-12', amount: 15 }), /already recorded/);
assert.throws(() => recordHmrcPayment(hmrc, period.periodEnd, { id: 'payment-abcdef12', date: '2027-08-12', amount: -10 }), /positive/);
assert.throws(() => recordHmrcPayment(hmrc, '2028-12-31', { id: 'payment-abcdef12', date: '2027-08-12', amount: 15 }), /recorded tax accounting period/);
hmrc = removeHmrcPayment(hmrc, period.periodEnd, 'payment-12345678');
assert.equal(hmrcPeriodSummary(hmrc, period.periodEnd).paid, 999.45);
assert.throws(() => removeHmrcPayment(hmrc, period.periodEnd, 'payment-12345678'), /not found/);
const second = { status: 'active', periodStart: '2027-01-01', periodEnd: '2027-12-31' };
hmrc = { ...hmrc, periods: [period, second] };
assert.equal(hmrcPeriodSummary(hmrc, second.periodEnd).payments.length, 0);
assert.equal(hmrcPeriodSummary(hmrc, second.periodEnd).liability, null, 'Unknown is not zero tax');
assert.equal(hmrcPeriodSummary(hmrc, second.periodEnd).outstanding, null);
assert.equal(hmrcPeriodSummary(hmrc, period.periodEnd).payments.length, 1);
assert.equal(normalizeHmrcTracking({ ...hmrc, periods: [second] }).records.length, 0);

const { hmrcDeadlines } = await import('../src/features/company/compliance-rules.js');
assert.equal(hmrcDeadlines({ status: 'active', periodStart: '2025-11-04', periodEnd: '2026-11-03' })['corporation-tax-payment'], '2027-08-04');
assert.equal(hmrcDeadlines({ status: 'active', periodStart: '2025-11-04', periodEnd: '2026-11-03' })['corporation-tax-return'], '2027-11-03');
assert.equal(normalizeHmrcTracking({ ...hmrc, records: [{ periodEnd: second.periodEnd, paymentReference: 'bad' }] }).records[0].paymentReference, '');
const data = new Map();
globalThis.localStorage = { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, String(value)) };
globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };
const { saveCompanyProfile, getCompanyProfile, replaceCompanyProfile } = await import('../src/features/company/company-storage.js');
saveCompanyProfile({ companyName: 'SPV Ltd', hmrc });
assert.equal(getCompanyProfile().hmrc.records.length, 1);
assert.equal(getCompanyProfile().hmrc.setup.utrReceivedOn, '2026-02-04');
replaceCompanyProfile({ ...getCompanyProfile(), _cloudRevision: 4 });
assert.equal(getCompanyProfile().hmrc.records[0].payments.length, 1);
const html = readFileSync(new URL('../company/details.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../src/features/company/company.js', import.meta.url), 'utf8');
const cloud = readFileSync(new URL('../cloud.js', import.meta.url), 'utf8');
const assets = JSON.parse(readFileSync(new URL('../app-assets.json', import.meta.url), 'utf8'));
for (const id of ['hmrcSetupForm', 'hmrcFilingForm', 'hmrcPaymentForm', 'hmrcPeriodHistory']) assert.match(html, new RegExp('id="' + id + '"'));
assert.match(script, /saveHmrcPeriodRecord/);
assert.match(script, /recordHmrcPayment/);
assert.match(script, /removeHmrcPayment/);
assert.match(script, /formatComplianceDateUK/);
assert.match(script, /hmrcDisplayReference/, 'Sensitive HMRC payment references must be masked');
assert.match(script, /hmrcEvidenceMarkup/, 'Evidence should be on the period cards');
assert.match(cloud, /hmrc: record\?\.hmrc/);
assert.ok(assets.assets.includes('./src/features/company/hmrc-tracking.js'));
console.log('HMRC tax setup, CT600 and payment ledger checks passed.');
