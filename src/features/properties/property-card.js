import { formatDate } from '../../utils/format-utils.js';

function isSameLocalDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

export function formatViewingDate(value, now = new Date()) {
  const raw = String(value || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(raw);
  if (!match) return '';

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4] || 0),
    Number(match[5] || 0)
  );
  if (Number.isNaN(date.getTime())) return '';

  const dateLabel = formatDate(date);
  if (!match[4] || !match[5]) return dateLabel;

  const timeLabel = formatDate(date, { hour: '2-digit', minute: '2-digit', hour12: false });
  if (isSameLocalDay(date, now)) return `Today at ${timeLabel}`;

  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (isSameLocalDay(date, tomorrow)) return `Tomorrow at ${timeLabel}`;

  return `${dateLabel} · ${timeLabel}`;
}

function renderPropertyStats(calc, { money, number }) {
  return `<div class="property-stats">
    <div><span>Purchase Price</span><strong>${money(calc.purchasePrice)}</strong></div>
    <div><span>Deposit</span><strong>${number(calc.depositPercent)}% · ${money(calc.depositAmount)}</strong></div>
    <div><span>Mortgage</span><strong>${money(calc.mortgageRequired)}</strong></div>
    <div><span>Purchase Costs</span><strong>${money(calc.totalPurchaseCostsExcludingDeposit)}</strong></div>
  </div>`;
}

function renderPropertyCostBreakdown(calc, { money }) {
  return `<div class="property-total property-cost-breakdown">
    <div><span>Cash to Buy Property</span><strong>${money(calc.totalCashRequired - calc.refurbishment)}</strong></div>
    <div class="refurbishment-row"><span>+ Refurbishment</span><strong>${money(calc.refurbishment)}</strong></div>
    <div class="investment-total"><span>Total Investment</span><strong>${money(calc.totalCashRequired)}</strong></div>
  </div>`;
}

function linkPropertyTitleToMap(headerHtml, property) {
  const title = String(property?.title || '').trim();
  if (!title) return headerHtml;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}`;
  return String(headerHtml || '').replace(
    /<h3>([\s\S]*?)<\/h3>/,
    `<h3><a class="property-map-link" href="${mapUrl}" target="_blank" rel="noopener noreferrer" title="Open in Google Maps">$1</a></h3>`
  );
}

export function createPropertyCard({
  property,
  calc,
  archived = false,
  headerHtml,
  toolsHtml = '',
  actionsHtml = '',
  formatters
}) {
  const card = document.createElement('article');
  card.className = `property-card${archived ? ' archived-card' : ''}`;
  const editControl = archived
    ? ''
    : `<button class="property-card-open" type="button" aria-label="Open ${formatters.escape(property.title || 'Untitled Property')} for editing"></button>`;
  const linkedHeaderHtml = linkPropertyTitleToMap(headerHtml, property);

  card.innerHTML = `${editControl}${toolsHtml}
    <div class="property-card-header"><div>${linkedHeaderHtml}</div></div>
    ${renderPropertyStats(calc, formatters)}
    ${renderPropertyCostBreakdown(calc, formatters)}
    ${actionsHtml}`;
  return card;
}

export { renderPropertyStats, renderPropertyCostBreakdown };
