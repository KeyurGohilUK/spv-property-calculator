export const EXPENSE_PAYER_OPTIONS = Object.freeze([
  { value: 'company', label: 'Company account' },
  { value: 'director-a', label: 'Director A (personal funds)' },
  { value: 'director-b', label: 'Director B (personal funds)' },
  { value: 'unrecorded', label: 'Not recorded' }
]);

const labels = new Map(EXPENSE_PAYER_OPTIONS.map(({ value, label }) => [value, label]));

export function normalizeExpensePayer(value) {
  const payer = String(value || 'unrecorded');
  return labels.has(payer) ? payer : 'unrecorded';
}

export function getExpensePayerLabel(value) {
  return labels.get(normalizeExpensePayer(value));
}
