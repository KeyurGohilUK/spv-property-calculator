import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hmrcGuidedState } from '../src/features/company/hmrc-guided.js';
import { saveHmrcSetup } from '../src/features/company/hmrc-tracking.js';

let hmrc = { status: 'unknown', periods: [] };
assert.equal(hmrcGuidedState(hmrc).current, 'utr');
assert.deepEqual(hmrcGuidedState(hmrc).allowed, ['utr']);
hmrc = saveHmrcSetup(hmrc, { utrStatus: 'pending' });
assert.equal(hmrcGuidedState(hmrc).current, 'activity');
assert.match(hmrcGuidedState(hmrc).pending.join(' '), /UTR letter pending/);
hmrc = { ...saveHmrcSetup(hmrc, { activityStage: 'preparing' }), status: 'unknown' };
assert.equal(hmrcGuidedState(hmrc).current, 'activity', 'Preparing for purchase must not imply CT activation');
assert.equal(hmrcGuidedState(hmrc).allowed.includes('registration'), false);
hmrc = { ...saveHmrcSetup(hmrc, { activityStage: 'dormant' }), status: 'dormant' };
assert.equal(hmrcGuidedState(hmrc).current, 'activity', 'Dormancy must not unlock tax periods');
hmrc = { ...saveHmrcSetup(hmrc, { activityStage: 'active' }), status: 'active' };
assert.equal(hmrcGuidedState(hmrc).current, 'registration');
hmrc = saveHmrcSetup(hmrc, { registrationStatus: 'pending' });
assert.equal(hmrcGuidedState(hmrc).current, 'period', 'Pending letter should not block an active company period');
assert.match(hmrcGuidedState(hmrc).pending.join(' '), /registration pending/);
hmrc.periods = [{ status: 'active', periodStart: '2026-01-01', periodEnd: '2026-12-31' }];
assert.equal(hmrcGuidedState(hmrc).current, 'records');
assert.equal(hmrcGuidedState(hmrc, 'utr').current, 'utr', 'Completed steps remain editable');
assert.equal(hmrcGuidedState(hmrc, 'not-valid').current, 'records');
hmrc = saveHmrcSetup(hmrc, { utrReceivedOn: '2026-01-04', utrStatus: 'received', registrationConfirmedOn: '2026-02-12', registrationStatus: 'confirmed' });
assert.deepEqual(hmrcGuidedState(hmrc).pending, [], 'Pending notices clear on confirmation');
const html = readFileSync(new URL('../company/details.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../src/features/company/company.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles/features/company.css', import.meta.url), 'utf8');
for (const id of ['hmrcGuideSteps','hmrcSetupStage','hmrcActivityStage','hmrcPeriodStage','hmrcRecordsStage','hmrcPendingBtn']) {
  assert.match(html, new RegExp('id="' + id + '"'));
}
assert.match(script, /renderHmrcGuide\(\)/);
assert.match(styles, /\.hmrc-guide-section\[hidden\]/);
console.log('HMRC guided workflow checks passed.');
