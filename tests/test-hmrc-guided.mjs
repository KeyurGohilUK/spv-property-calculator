import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hmrcOverviewState } from '../src/features/company/hmrc-guided.js';
import { saveHmrcSetup } from '../src/features/company/hmrc-tracking.js';

let hmrc = { status: 'unknown', periods: [] };
assert.deepEqual(hmrcOverviewState(hmrc), { activity: '', registrationAnswered: false, utrReceived: false, setupRecorded: 0, hasPeriods: false });
hmrc = saveHmrcSetup(hmrc, { utrStatus: 'pending' });
assert.equal(hmrcOverviewState(hmrc).setupRecorded, 0, 'Waiting must never count as received');
hmrc = { ...saveHmrcSetup(hmrc, { activityStage: 'preparing' }), status: 'unknown' };
assert.equal(hmrcOverviewState(hmrc).activity, 'preparing');
assert.equal(hmrcOverviewState(hmrc).registrationAnswered, false);
hmrc = { ...saveHmrcSetup(hmrc, { activityStage: 'dormant' }), status: 'dormant' };
assert.equal(hmrcOverviewState(hmrc).activity, 'dormant');
hmrc = { ...saveHmrcSetup(hmrc, { activityStage: 'active' }), status: 'active' };
assert.equal(hmrcOverviewState(hmrc).activity, 'active');
hmrc = saveHmrcSetup(hmrc, { registrationStatus: 'pending' });
assert.equal(hmrcOverviewState(hmrc).registrationAnswered, true, 'Pending registration does not prevent recording active period dates');
hmrc.periods = [{ status: 'active', periodStart: '2026-01-01', periodEnd: '2026-12-31' }];
assert.equal(hmrcOverviewState(hmrc).hasPeriods, true);
hmrc = saveHmrcSetup(hmrc, { utrReceivedOn: '2026-01-04', registrationConfirmedOn: '2026-02-12' });
assert.equal(hmrcOverviewState(hmrc).setupRecorded, 2);

const html = readFileSync(new URL('../company/details.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../src/features/company/company.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles/features/company.css', import.meta.url), 'utf8');
for (const id of ['hmrcSetupViewTab','hmrcRecurringViewTab','hmrcSetupCards','hmrcPeriodHistory','hmrcSetupDialog','hmrcActivityDialog','hmrcFilingDialog','hmrcPaymentDialog','hmrcPeriodDialog']) {
  assert.match(html, new RegExp('id="' + id + '"'));
}
assert.doesNotMatch(html, /id="hmrcEvidenceDialog"|id="hmrcEvidenceInput"/, 'Standalone HMRC evidence dialog removed');
assert.match(html, /<form id="hmrcSetupForm"[\\s\\S]*?id="hmrcSetupEvidenceInput"/, 'Setup uploads belong to the setup record dialog');
assert.match(html, /<form id="hmrcFilingForm"[\\s\\S]*?id="hmrcFilingEvidenceInput"/, 'CT600 uploads belong to the CT600 record dialog');
assert.match(html, /<form id="hmrcPaymentForm"[\\s\\S]*?id="hmrcPaymentEvidenceInput"/, 'Payment receipts belong to the payment record dialog');
assert.doesNotMatch(script, /hmrcEvidenceDialog|hmrcEvidenceInput|hmrcDialogs[.]evidence/, 'No standalone HMRC evidence dialog behavior remains');
assert.ok(script.includes('function openHmrcEvidenceRecord('), 'Document actions open the matching record dialog');
assert.doesNotMatch(html, /id="hmrcComplianceItems"/, 'Duplicate HMRC checklist removed');
assert.doesNotMatch(html, /id="hmrcGuideSteps"/, 'Old 5-step wizard removed');
assert.doesNotMatch(script, /renderHmrcGuide|hmrcEditingPeriod|openEvidenceRequirement/, 'Old UI handlers removed');
assert.match(styles, /\.hmrc-pill--success/);
assert.match(styles, /\.hmrc-pill--warning/);
assert.match(script, /renderHmrcDashboard\(\)/);
console.log('HMRC setup and recurring period layout checks passed.');
