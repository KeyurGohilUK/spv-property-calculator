import { validDate, hmrcTaxPeriods } from './compliance-rules.js';

const clean = (value, limit = 160) => String(value || '').trim().slice(0, limit);
const date = (value) => validDate(value) ? value : '';
const money = (value) => {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1000000000
    ? Math.round(number * 100) / 100 : null;
};
const PAYMENT_ID = /^[A-Za-z0-9_-]{8,80}$/;

export function normalizeHmrcTracking(hmrc = {}) {
  const periods = hmrcTaxPeriods(hmrc);
  const periodEnds = new Set(periods.map((p) => p.periodEnd));
  const records = Array.isArray(hmrc.records) ? hmrc.records : [];
  return {
    setup: {
      utrReceivedOn: date(hmrc.setup?.utrReceivedOn),
      utrStatus: hmrc.setup?.utrStatus === 'pending' ? 'pending' : 'received',
      activityStage: ['preparing', 'active', 'dormant'].includes(hmrc.setup?.activityStage) ? hmrc.setup.activityStage : '',
      registrationStatus: hmrc.setup?.registrationStatus === 'pending' ? 'pending' : 'confirmed',
      registrationConfirmedOn: date(hmrc.setup?.registrationConfirmedOn),
      registrationReference: clean(hmrc.setup?.registrationReference, 100),
      accountantName: clean(hmrc.setup?.accountantName)
    },
    records: records.filter((record) => periodEnds.has(record?.periodEnd)).slice(0, 100)
      .map((record) => ({
        periodEnd: record.periodEnd,
        filedOn: date(record.filedOn),
        filingReference: clean(record.filingReference, 120),
        liability: money(record.liability),
        reviewedOn: date(record.reviewedOn),
        reviewedBy: clean(record.reviewedBy),
        payments: Array.isArray(record.payments) ? record.payments.filter((payment) => PAYMENT_ID.test(String(payment?.id || '')) && validDate(payment.date) && Number(payment.amount) > 0 && money(payment.amount) !== null).slice(0, 200).map((payment) => ({
          id: payment.id, date: payment.date, amount: money(payment.amount),
          reference: clean(payment.reference, 160)
        })) : []
      }))
  };
}

export function hmrcPeriodSummary(hmrc, periodEnd) {
  const record = normalizeHmrcTracking(hmrc).records.find((item) => item.periodEnd === periodEnd) || {
    periodEnd, filedOn: '', filingReference: '', liability: null, reviewedOn: '', reviewedBy: '', payments: []
  };
  const paid = Math.round(record.payments.reduce((sum, payment) => sum + payment.amount, 0) * 100) / 100;
  return { ...record, paid, outstanding: record.liability === null ? null : Math.max(0, Math.round((record.liability - paid) * 100) / 100), overpayment: record.liability === null ? null : Math.max(0, Math.round((paid - record.liability) * 100) / 100) };
}

export function saveHmrcSetup(hmrc, changes) {
  return { ...hmrc, setup: normalizeHmrcTracking({ ...hmrc, setup: { ...hmrc.setup, ...changes } }).setup };
}

export function saveHmrcPeriodRecord(hmrc, periodEnd, changes) {
  if (!hmrcTaxPeriods(hmrc).some((period) => period.periodEnd === periodEnd)) throw new Error('Choose a recorded tax accounting period.');
  const records = normalizeHmrcTracking(hmrc).records.filter((item) => item.periodEnd !== periodEnd);
  const previous = hmrcPeriodSummary(hmrc, periodEnd);
  const next = normalizeHmrcTracking({ ...hmrc, records: [...records, { ...previous, ...changes, periodEnd }] }).records;
  return { ...hmrc, records: next };
}

export function recordHmrcPayment(hmrc, periodEnd, payment) {
  if (!validDate(payment.date)) throw new Error('Enter a valid payment date.');
  const amount = money(payment.amount);
  if (amount === null || amount <= 0) throw new Error('Enter a positive payment amount.');
  if (!PAYMENT_ID.test(String(payment.id || ''))) throw new Error('Invalid payment reference.');
  const record = hmrcPeriodSummary(hmrc, periodEnd);
  if (record.payments.some((p) => p.id === payment.id)) throw new Error('Payment already recorded.');
  return saveHmrcPeriodRecord(hmrc, periodEnd, {
    payments: [...record.payments, { id: payment.id, date: payment.date, amount, reference: clean(payment.reference) }]
  });
}

export function removeHmrcPayment(hmrc, periodEnd, paymentId) {
  const record = hmrcPeriodSummary(hmrc, periodEnd);
  if (!record.payments.some((p) => p.id === paymentId)) throw new Error('Payment not found.');
  return saveHmrcPeriodRecord(hmrc, periodEnd, { payments: record.payments.filter((p) => p.id !== paymentId) });
}
