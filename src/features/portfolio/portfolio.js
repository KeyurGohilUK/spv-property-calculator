import { getActiveProperties } from '../properties/storage.js';
import { calculateProperty } from '../properties/calculations.js';
import { getPortfolioProperties } from '../properties/purchase-lifecycle.js';
import { escapeHtml, formatCurrency, formatDate } from '../../utils/format-utils.js';

const $ = (id) => document.getElementById(id);

function renderPortfolio() {
  const properties = getPortfolioProperties(getActiveProperties());
  const totalPurchasePrice = properties.reduce((total, property) => total + calculateProperty(property).purchasePrice, 0);
  const totalMortgage = properties.reduce((total, property) => total + calculateProperty(property).mortgageRequired, 0);
  $('portfolioCount').textContent = String(properties.length);
  $('portfolioPurchaseTotal').textContent = formatCurrency(totalPurchasePrice);
  $('portfolioMortgageTotal').textContent = formatCurrency(totalMortgage);
  $('portfolioEmpty').classList.toggle('hidden', properties.length > 0);

  $('portfolioList').innerHTML = properties.map((property) => {
    const calculation = calculateProperty(property);
    const title = escapeHtml(property.title || 'Untitled Property');
    const completionDate = property.completionDate ? formatDate(property.completionDate) : 'Date not recorded';
    return `<article class="portfolio-card">
      <div class="portfolio-card-heading"><div><p class="eyebrow">Owned property</p><h2>${title}</h2><p class="muted">Completed ${escapeHtml(completionDate)}</p></div>
        <a class="secondary-btn" href="./?property=${encodeURIComponent(property.id)}">Open purchase record</a></div>
      <div class="portfolio-card-stats"><div><span>Purchase price</span><strong>${formatCurrency(calculation.purchasePrice)}</strong></div>
        <div><span>Estimated mortgage</span><strong>${formatCurrency(calculation.mortgageRequired)}</strong></div>
        <div><span>Estimated cash invested</span><strong>${formatCurrency(calculation.totalCashRequired)}</strong></div></div>
    </article>`;
  }).join('');
}

renderPortfolio();
window.addEventListener('spv-workspace-synced', renderPortfolio);
window.addEventListener('storage', (event) => {
  if (!event.key || event.key === 'spv-property-calculator.properties.v1') renderPortfolio();
});
