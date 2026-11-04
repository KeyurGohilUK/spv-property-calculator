import { hmrcTaxPeriods } from './compliance-rules.js';
import { normalizeHmrcTracking } from './hmrc-tracking.js';

export const HMRC_STEPS = Object.freeze([
  { id: 'utr', title: 'UTR letter' },
  { id: 'activity', title: 'Company activity' },
  { id: 'registration', title: 'Corporation Tax registration' },
  { id: 'period', title: 'Tax accounting period' },
  { id: 'records', title: 'Returns and payments' }
]);

// "Pending" is a recorded answer, not compliance completion. Later
// deadlines remain visible so waiting for a letter cannot hide obligations.
export function hmrcGuidedState(hmrc = {}, selectedStep = '') {
  const setup = normalizeHmrcTracking(hmrc).setup;
  const utrAnswered = Boolean(setup.utrReceivedOn || setup.utrStatus === 'pending');
  const activity = setup.activityStage || (hmrc.status === 'active' ? 'active' : hmrc.status === 'dormant' ? 'dormant' : '');
  const registrationAnswered = Boolean(setup.registrationConfirmedOn || setup.registrationStatus === 'pending');
  const hasPeriods = hmrcTaxPeriods(hmrc).length > 0;
  let next = !utrAnswered ? 'utr' : !activity ? 'activity' : activity !== 'active' ? 'activity'
    : !registrationAnswered ? 'registration' : !hasPeriods ? 'period' : 'records';
  const allowed = ['utr'];
  if (utrAnswered) allowed.push('activity');
  if (utrAnswered && activity === 'active') allowed.push('registration');
  if (utrAnswered && activity === 'active' && registrationAnswered) allowed.push('period');
  if (utrAnswered && activity === 'active' && registrationAnswered && hasPeriods) allowed.push('records');
  return { current: allowed.includes(selectedStep) ? selectedStep : next, next, allowed, activity, utrAnswered, registrationAnswered, hasPeriods,
    pending: [setup.utrStatus === 'pending' && !setup.utrReceivedOn ? 'UTR letter pending' : '',
      activity === 'active' && setup.registrationStatus === 'pending' && !setup.registrationConfirmedOn ? 'Corporation Tax registration pending' : ''].filter(Boolean) };
}
