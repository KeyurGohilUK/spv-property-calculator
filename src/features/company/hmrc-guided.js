import { hmrcTaxPeriods } from './compliance-rules.js';
import { normalizeHmrcTracking } from './hmrc-tracking.js';

// Company setup is a one-time record. Accounting periods repeat every year.
export function hmrcOverviewState(hmrc = {}) {
  const setup = normalizeHmrcTracking(hmrc).setup;
  const activity = setup.activityStage || (hmrc.status === 'active' ? 'active' : hmrc.status === 'dormant' ? 'dormant' : '');
  const registrationAnswered = Boolean(setup.registrationConfirmedOn || setup.registrationStatus === 'pending');
  return {
    activity,
    registrationAnswered,
    utrReceived: Boolean(setup.utrReceivedOn),
    setupRecorded: Number(Boolean(setup.utrReceivedOn)) + Number(Boolean(activity)),
    hasPeriods: hmrcTaxPeriods(hmrc).length > 0
  };
}
