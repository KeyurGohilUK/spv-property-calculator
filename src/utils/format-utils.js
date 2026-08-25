const locale = 'en-GB';

export function parseNumber(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatCurrency(value, { minimumFractionDigits = 0, maximumFractionDigits = minimumFractionDigits } = {}) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'GBP', minimumFractionDigits, maximumFractionDigits })
    .format(parseNumber(value));
}

export function formatNumber(value, options = {}) {
  return new Intl.NumberFormat(locale, options).format(parseNumber(value));
}

export function formatPercentage(value, options = {}) {
  return `${formatNumber(value, { maximumFractionDigits: 1, ...options })}%`;
}

export function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }, fallback = '') {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : new Intl.DateTimeFormat(locale, options).format(date);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}