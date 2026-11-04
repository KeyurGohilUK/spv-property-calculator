import { hmrcTaxPeriods } from './compliance-rules.js';
import { normalizeHmrcTracking } from './hmrc-tracking.js';

// Company setup is a one-time record. Accounting periods repeat every year.
export function hmrcOverviewState(hmrc = {}) {
  const setup = normalizeHmrcTracking(hmrc).setup;
  const activity = setup.activityStage || (hmrc.status === 'active' ? 'active' : hmrc.status === 'dormant' ? 'dormant' : '');
  const registrationAnswered = Boolean(setup.registrationConfirmedOn || setup.registrationStatus === 'pending');
  const utrReceived = Boolean(setup.utrReceivedOn);
  const activityConfirmed = ['active', 'dormant'].includes(activity);
  const registrationRequired = activity === 'active';
  const registrationConfirmed = Boolean(setup.registrationConfirmedOn);
  return {
    activity,
    registrationAnswered,
    utrReceived,
    setupRecorded: Number(utrReceived) + Number(activityConfirmed) + Number(registrationRequired && registrationConfirmed),
    setupTotal: registrationRequired ? 3 : 2,
    hasPeriods: hmrcTaxPeriods(hmrc).length > 0
  };
}
