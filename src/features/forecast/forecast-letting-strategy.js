import { getForecastProperty } from './forecast-property.js';
import { formatCurrency, formatPercentage, parseNumber } from '../../utils/format-utils.js';
import { buildPriceSensitivity, compareLettingStrategies, evaluateHmoSuitability } from './letting-strategy-calculations.js';

const STORAGE_KEY = 'spv-property-calculator.forecast-letting-strategies.v1';
const STYLE_ID = 'forecastLettingStrategyStyles';
const $ = (id) => document.getElementById(id);
const money = (value) => formatCurrency(value);
const pct = (value) => formatPercentage(value);
const numeric = (id, fallback = 0) => parseNumber($(id)?.value, fallback);

function ensureStylesheet() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = './styles/features/forecast-letting-strategy.css';
  document.head.appendChild(link);
}

function readStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch {}
}

function selectedProperty() {
  return getForecastProperty($('forecastProperty')?.value);
}

function defaultAssumptions(property) {
  const baseRate = Math.max(0, numeric('interestRate', 5.5));
  const familyRent = Math.max(0, numeric('monthlyRent', 1600));
  const asking = Math.max(0, Number(property?.purchasePrice) || 0);
  return {
    familyRent,
    roomRents: [725, 700, 650, 725],
    councilTax: 175,
    utilities: 220,
    water: 45,
    broadband: 35,
    cleaning: 50,
    otherHmoCosts: 25,
    btlRate: baseRate,
    hmoRate: baseRate + 0.2,
    maintenanceVoidPercent: 10,
    managementPercent: 0,
    mortgageType: $('mortgageType')?.value || 'interest-only',
    mortgageTerm: Math.max(1, numeric('mortgageTerm', 25)),
    roomSizes: [0, 0, 0, 0],
    kitchenArea: 0,
    communalArea: 0,
    offerPrices: [Math.max(0, asking - 25000), Math.max(0, asking - 15000), asking]
  };
}

function loadAssumptions(property) {
  const saved = readStore()[property?.id] || {};
  const defaults = defaultAssumptions(property);
  return {
    ...defaults,
    ...saved,
    roomRents: Array.isArray(saved.roomRents) ? [...defaults.roomRents, ...saved.roomRents].slice(0, 4) : defaults.roomRents,
    roomSizes: Array.isArray(saved.roomSizes) ? [...defaults.roomSizes, ...saved.roomSizes].slice(0, 4) : defaults.roomSizes,
    offerPrices: Array.isArray(saved.offerPrices) ? [...defaults.offerPrices, ...saved.offerPrices].slice(0, 3) : defaults.offerPrices
  };
}

function currentAssumptions() {
  const roomRents = [1, 2, 3, 4].map((number) => Math.max(0, numeric(`strategyRoom${number}Rent`)));
  const roomSizes = [1, 2, 3, 4].map((number) => Math.max(0, numeric(`strategyRoom${number}Size`)));
  const councilTax = Math.max(0, numeric('strategyCouncilTax'));
  const utilities = Math.max(0, numeric('strategyUtilities'));
  const water = Math.max(0, numeric('strategyWater'));
  const broadband = Math.max(0, numeric('strategyBroadband'));
  const cleaning = Math.max(0, numeric('strategyCleaning'));
  const otherHmoCosts = Math.max(0, numeric('strategyOtherHmoCosts'));
  return {
    familyRent: Math.max(0, numeric('strategyFamilyRent')),
    roomRents,
    councilTax,
    utilities,
    water,
    broadband,
    cleaning,
    otherHmoCosts,
    hmoBills: councilTax + utilities + water + broadband + cleaning + otherHmoCosts,
    btlRate: Math.max(0, numeric('strategyBtlRate')),
    hmoRate: Math.max(0, numeric('strategyHmoRate')),
    maintenanceVoidPercent: Math.max(0, numeric('strategyMaintenanceVoidPercent')),
    managementPercent: Math.max(0, numeric('strategyManagementPercent')),
    mortgageType: $('mortgageType')?.value || 'interest-only',
    mortgageTerm: Math.max(1, numeric('mortgageTerm', 25)),
    roomSizes,
    kitchenArea: Math.max(0, numeric('strategyKitchenArea')),
    communalArea: Math.max(0, numeric('strategyCommunalArea')),
    offerPrices: [1, 2, 3].map((number) => Math.max(0, numeric(`strategyOfferPrice${number}`)))
  };
}

function saveAssumptions(property) {
  if (!property) return;
  const all = readStore();
  all[property.id] = currentAssumptions();
  writeStore(all);
}

function field(label, id, value, { prefix = '£', suffix = '', step = '1', min = '0' } = {}) {
  const wrapperClass = prefix ? 'input-prefix' : 'forecast-suffix-input';
  const prefixMarkup = prefix ? `<span aria-hidden="true">${prefix}</span>` : '';
  const suffixMarkup = suffix ? `<span aria-hidden="true">${suffix}</span>` : '';
  return `<label class="field strategy-field"><span>${label}</span><span class="${wrapperClass}">${prefixMarkup}<input id="${id}" type="number" min="${min}" step="${step}" inputmode="decimal" value="${value}">${suffixMarkup}</span></label>`;
}

function inject() {
  ensureStylesheet();
  if ($('lettingStrategyComparison')) return;
  const assumptionsCard = document.querySelector('.assumptions-card');
  if (!assumptionsCard) return;
  const section = document.createElement('section');
  section.id = 'lettingStrategyComparison';
  section.className = 'forecast-card strategy-comparison-card';
  section.innerHTML = `
    <div class="forecast-section-heading strategy-heading">
      <div><p class="eyebrow">Letting strategy</p><h3>BTL vs 3 HMO vs 4 HMO</h3><p class="muted strategy-intro">Compare Year 1 rent, monthly costs and pre-tax cash flow using the same property and finance assumptions.</p></div>
      <button id="resetStrategyBtn" class="secondary-btn compact-btn" type="button">Reset</button>
    </div>
    <div id="strategyInputArea"></div>
    <div class="strategy-comparison-heading"><h4>Side-by-side comparison</h4><span class="muted tiny">Higher rent does not always mean higher cash flow.</span></div>
    <div id="strategyCards" class="strategy-cards" aria-live="polite"></div>
    <div id="strategyInsight" class="strategy-insight" aria-live="polite"></div>
    <details class="strategy-details">
      <summary>HMO suitability screening</summary>
      <div id="strategySuitabilityInputs" class="strategy-suitability-inputs"></div>
      <div id="strategySuitabilityResult" class="strategy-suitability-result"></div>
      <p class="muted tiny">Screening only. This does not confirm planning, licensing, fire-safety or HMO compliance. Verify the exact property with the relevant council and professional advisers.</p>
    </details>
    <details class="strategy-details">
      <summary>Offer price sensitivity</summary>
      <div id="strategyOfferInputs" class="strategy-offer-inputs"></div>
      <div id="strategyPriceTable" class="strategy-price-table-wrap"></div>
    </details>`;
  assumptionsCard.insertAdjacentElement('afterend', section);
}

function populateInputs(property, data) {
  const inputArea = $('strategyInputArea');
  if (!inputArea) return;
  inputArea.innerHTML = `
    <div class="strategy-input-groups">
      <section class="strategy-input-group"><h4>Income</h4><div class="strategy-field-grid">
        ${field('Family BTL rent / month', 'strategyFamilyRent', data.familyRent)}
        ${field('Room 1 rent', 'strategyRoom1Rent', data.roomRents[0])}
        ${field('Room 2 rent', 'strategyRoom2Rent', data.roomRents[1])}
        ${field('Room 3 rent', 'strategyRoom3Rent', data.roomRents[2])}
        ${field('Room 4 rent', 'strategyRoom4Rent', data.roomRents[3])}
      </div><div class="strategy-total-line"><span>3-HMO rent</span><strong id="strategyHmo3Rent">£0</strong><span>4-HMO rent</span><strong id="strategyHmo4Rent">£0</strong></div></section>
      <section class="strategy-input-group"><h4>HMO household costs / month</h4><div class="strategy-field-grid">
        ${field('Council tax', 'strategyCouncilTax', data.councilTax)}
        ${field('Gas & electricity', 'strategyUtilities', data.utilities)}
        ${field('Water', 'strategyWater', data.water)}
        ${field('Broadband', 'strategyBroadband', data.broadband)}
        ${field('Cleaning', 'strategyCleaning', data.cleaning)}
        ${field('Other HMO costs', 'strategyOtherHmoCosts', data.otherHmoCosts)}
      </div><div class="strategy-total-line"><span>Total HMO bills</span><strong id="strategyHmoBills">£0</strong></div></section>
      <section class="strategy-input-group"><h4>Finance & reserves</h4><div class="strategy-field-grid">
        ${field('BTL mortgage rate', 'strategyBtlRate', data.btlRate, { prefix: '', suffix: '%', step: '0.1' })}
        ${field('HMO mortgage rate', 'strategyHmoRate', data.hmoRate, { prefix: '', suffix: '%', step: '0.1' })}
        ${field('Maintenance + void reserve', 'strategyMaintenanceVoidPercent', data.maintenanceVoidPercent, { prefix: '', suffix: '% rent', step: '0.5' })}
        ${field('Management fee', 'strategyManagementPercent', data.managementPercent, { prefix: '', suffix: '% rent', step: '0.5' })}
      </div></section>
    </div>`;

  $('strategySuitabilityInputs').innerHTML = `
    <div class="strategy-field-grid suitability-fields">
      ${field('Bedroom 1', 'strategyRoom1Size', data.roomSizes[0], { prefix: '', suffix: 'm²', step: '0.1' })}
      ${field('Bedroom 2', 'strategyRoom2Size', data.roomSizes[1], { prefix: '', suffix: 'm²', step: '0.1' })}
      ${field('Bedroom 3', 'strategyRoom3Size', data.roomSizes[2], { prefix: '', suffix: 'm²', step: '0.1' })}
      ${field('Bedroom 4', 'strategyRoom4Size', data.roomSizes[3], { prefix: '', suffix: 'm²', step: '0.1' })}
      ${field('Kitchen area', 'strategyKitchenArea', data.kitchenArea, { prefix: '', suffix: 'm²', step: '0.1' })}
      ${field('Communal area after bedroom conversion', 'strategyCommunalArea', data.communalArea, { prefix: '', suffix: 'm²', step: '0.1' })}
    </div>`;

  $('strategyOfferInputs').innerHTML = `<div class="strategy-field-grid offer-fields">
    ${field('Offer scenario 1', 'strategyOfferPrice1', data.offerPrices[0], { step: '1000' })}
    ${field('Offer scenario 2', 'strategyOfferPrice2', data.offerPrices[1], { step: '1000' })}
    ${field('Current / asking price', 'strategyOfferPrice3', data.offerPrices[2] || property.purchasePrice, { step: '1000' })}
  </div>`;
}

function differenceCopy(result, label) {
  const difference = result.differenceVsBtl;
  if (Math.abs(difference) < 1) return `${label} is broadly level with BTL cash flow.`;
  const direction = difference > 0 ? 'more' : 'less';
  return `${money(Math.abs(difference))}/month ${direction} cash flow than BTL.`;
}

function card(title, subtitle, result, difference) {
  const negative = result.monthlyCashFlow < 0;
  return `<article class="strategy-card ${negative ? 'strategy-card-negative' : ''}">
    <div class="strategy-card-title"><div><span>${subtitle}</span><h4>${title}</h4></div></div>
    <div class="strategy-card-primary"><span>Monthly cash flow</span><strong class="${negative ? 'negative-value' : ''}">${money(result.monthlyCashFlow)}</strong><small>${money(result.annualCashFlow)} / year</small></div>
    <dl class="strategy-metrics">
      <div><dt>Rent</dt><dd>${money(result.monthlyRent)}</dd></div>
      <div><dt>Mortgage</dt><dd>${money(result.mortgage)}</dd></div>
      <div><dt>Household bills</dt><dd>${result.householdBills ? money(result.householdBills) : 'Tenant pays'}</dd></div>
      <div><dt>Maintenance / void / management</dt><dd>${money(result.operatingReserve)}</dd></div>
      <div class="strategy-cost-total"><dt>Total monthly costs</dt><dd>${money(result.totalMonthlyCost)}</dd></div>
      <div><dt>Gross yield</dt><dd>${pct(result.grossYield)}</dd></div>
      <div><dt>Cash-on-cash</dt><dd>${pct(result.cashOnCash)}</dd></div>
    </dl>
    ${difference ? `<p class="strategy-difference">${difference}</p>` : '<p class="strategy-difference">Family-let baseline</p>'}
  </article>`;
}

function suitabilityRows(result) {
  const statusText = { pass: 'Pass', close: 'Close - check', fail: 'Below benchmark', unknown: 'Enter size' };
  const statusClass = (status) => `screen-${status}`;
  const rows = result.bedrooms.map((item, index) => `<div><span>Bedroom ${index + 1}</span><strong class="${statusClass(item.status)}">${item.value ? `${item.value.toFixed(1)} m²` : '—'} · ${statusText[item.status]}</strong><small>Benchmark ${item.minimum} m²</small></div>`);
  rows.push(`<div><span>Kitchen</span><strong class="${statusClass(result.kitchen.status)}">${result.kitchen.value ? `${result.kitchen.value.toFixed(1)} m²` : '—'} · ${statusText[result.kitchen.status]}</strong><small>4-person benchmark ${result.kitchen.minimum} m²</small></div>`);
  rows.push(`<div><span>Communal area</span><strong class="${statusClass(result.communal.status)}">${result.communal.value ? `${result.communal.value.toFixed(1)} m²` : '—'} · ${statusText[result.communal.status]}</strong><small>4-person benchmark ${result.communal.minimum} m²</small></div>`);
  return rows.join('');
}

function render() {
  const property = selectedProperty();
  if (!property || !$('lettingStrategyComparison')) return;
  const assumptions = currentAssumptions();
  const comparison = compareLettingStrategies({ property, assumptions });
  $('strategyHmo3Rent').textContent = money(comparison.hmo3.monthlyRent);
  $('strategyHmo4Rent').textContent = money(comparison.hmo4.monthlyRent);
  $('strategyHmoBills').textContent = `${money(assumptions.hmoBills)} / month`;
  $('strategyCards').innerHTML = [
    card('Family BTL', 'Whole-property let', comparison.family),
    card('3-Person HMO', 'Three separately rented rooms', comparison.hmo3, differenceCopy(comparison.hmo3, '3-person HMO')),
    card('4-Person HMO', 'Four separately rented rooms', comparison.hmo4, differenceCopy(comparison.hmo4, '4-person HMO'))
  ].join('');

  const hmo3Better = comparison.hmo3.differenceVsBtl > 0;
  const hmo4Better = comparison.hmo4.differenceVsBtl > 0;
  $('strategyInsight').innerHTML = `<div class="strategy-insight-row"><strong>3 HMO vs BTL</strong><span>${hmo3Better ? '+' : '−'}${money(Math.abs(comparison.hmo3.differenceVsBtl))}/month ${hmo3Better ? 'higher' : 'lower'} cash flow</span></div><div class="strategy-insight-row"><strong>4 HMO vs BTL</strong><span>${hmo4Better ? '+' : '−'}${money(Math.abs(comparison.hmo4.differenceVsBtl))}/month ${hmo4Better ? 'higher' : 'lower'} cash flow</span></div>`;

  const screening = evaluateHmoSuitability({ occupants: 4, roomSizes: assumptions.roomSizes, kitchenArea: assumptions.kitchenArea, communalArea: assumptions.communalArea });
  const screeningLabel = screening.status === 'pass' ? 'Passes entered-size screening' : screening.status === 'fail' ? 'Does not pass entered-size screening' : 'Needs measurement / checking';
  $('strategySuitabilityResult').innerHTML = `<div class="strategy-screening-summary"><strong>${screeningLabel}</strong><span>4-person HMO size screen</span></div><div class="strategy-screening-grid">${suitabilityRows(screening)}</div>`;

  const prices = assumptions.offerPrices;
  const sensitivity = buildPriceSensitivity({ property, prices, assumptions });
  $('strategyPriceTable').innerHTML = `<table class="strategy-price-table"><thead><tr><th>Purchase price</th><th>BTL</th><th>3 HMO</th><th>4 HMO</th><th>4 HMO CoC</th></tr></thead><tbody>${sensitivity.map((row) => `<tr><td>${money(row.purchasePrice)}</td><td>${money(row.familyCashFlow)}/mo</td><td>${money(row.hmo3CashFlow)}/mo</td><td><strong>${money(row.hmo4CashFlow)}/mo</strong></td><td>${pct(row.hmo4CashOnCash)}</td></tr>`).join('')}</tbody></table>`;
}

function loadForSelectedProperty() {
  const property = selectedProperty();
  if (!property || !$('lettingStrategyComparison')) return;
  populateInputs(property, loadAssumptions(property));
  render();
}

function resetSelectedProperty() {
  const property = selectedProperty();
  if (!property) return;
  const store = readStore();
  delete store[property.id];
  writeStore(store);
  populateInputs(property, defaultAssumptions(property));
  render();
}

function init() {
  inject();
  loadForSelectedProperty();
  document.addEventListener('input', (event) => {
    if (!event.target.closest('#lettingStrategyComparison')) return;
    const property = selectedProperty();
    saveAssumptions(property);
    requestAnimationFrame(render);
  });
  document.addEventListener('change', (event) => {
    if (event.target.id === 'forecastProperty') {
      requestAnimationFrame(loadForSelectedProperty);
      return;
    }
    if (event.target.closest('#lettingStrategyComparison')) {
      saveAssumptions(selectedProperty());
      requestAnimationFrame(render);
    }
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest('#resetStrategyBtn')) resetSelectedProperty();
  });
}

document.addEventListener('DOMContentLoaded', init);
