import { getForecastProperty } from './forecast-property.js';
import { formatCurrency, formatPercentage, parseNumber } from '../../utils/format-utils.js';
import { buildPriceSensitivity, compareLettingStrategies, evaluateHmoSuitability } from './letting-strategy-calculations.js';

const STORAGE_KEY = 'spv-property-calculator.forecast-letting-strategies.v1';
const STYLE_ID = 'forecastLettingStrategyStyles';
const $ = (id) => document.getElementById(id);
const money = (value) => formatCurrency(value);
const pct = (value) => formatPercentage(value);
const num = (id, fallback = 0) => parseNumber($(id)?.value, fallback);
const safe = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
};

function ensureStylesheet() {
  if ($(STYLE_ID)) return;
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
  } catch { return {}; }
}
function writeStore(store) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch {} }
function property() { return getForecastProperty($('forecastProperty')?.value); }

function defaults(item) {
  const asking = safe(item?.purchasePrice);
  const rate = safe(num('interestRate', 5.5), 5.5);
  return {
    familyRent: safe(num('monthlyRent', 1600), 1600),
    roomRents: [725, 700, 625, 750],
    councilTax: 175, utilities: 220, water: 45, broadband: 35, cleaning: 50, otherHmoCosts: 25,
    btlRate: rate, hmoRate: rate + 0.2, maintenanceVoidPercent: 10, managementPercent: 0,
    roomSizes: [0, 0, 0, 0], kitchenArea: 0, communalArea: 0,
    offerPrices: [Math.max(0, asking - 25000), Math.max(0, asking - 15000), asking]
  };
}

function normaliseArray(saved, fallback, length) {
  return Array.from({ length }, (_, index) => safe(saved?.[index], fallback[index] || 0));
}

function load(item) {
  const base = defaults(item);
  const saved = readStore()[item?.id];
  if (!saved || typeof saved !== 'object') return base;
  return {
    familyRent: safe(saved.familyRent, base.familyRent),
    roomRents: normaliseArray(saved.roomRents, base.roomRents, 4),
    councilTax: safe(saved.councilTax, base.councilTax),
    utilities: safe(saved.utilities, base.utilities),
    water: safe(saved.water, base.water),
    broadband: safe(saved.broadband, base.broadband),
    cleaning: safe(saved.cleaning, base.cleaning),
    otherHmoCosts: safe(saved.otherHmoCosts, base.otherHmoCosts),
    btlRate: safe(saved.btlRate, base.btlRate),
    hmoRate: safe(saved.hmoRate, base.hmoRate),
    maintenanceVoidPercent: safe(saved.maintenanceVoidPercent, base.maintenanceVoidPercent),
    managementPercent: safe(saved.managementPercent, base.managementPercent),
    roomSizes: normaliseArray(saved.roomSizes, base.roomSizes, 4),
    kitchenArea: safe(saved.kitchenArea, base.kitchenArea),
    communalArea: safe(saved.communalArea, base.communalArea),
    offerPrices: normaliseArray(saved.offerPrices, base.offerPrices, 3)
  };
}

function assumptions() {
  const roomRents = [1,2,3,4].map((i) => safe(num(`strategyRoom${i}Rent`)));
  const roomSizes = [1,2,3,4].map((i) => safe(num(`strategyRoom${i}Size`)));
  const councilTax = safe(num('strategyCouncilTax'));
  const utilities = safe(num('strategyUtilities'));
  const water = safe(num('strategyWater'));
  const broadband = safe(num('strategyBroadband'));
  const cleaning = safe(num('strategyCleaning'));
  const otherHmoCosts = safe(num('strategyOtherHmoCosts'));
  return {
    familyRent: safe(num('strategyFamilyRent')),
    roomRents,
    councilTax, utilities, water, broadband, cleaning, otherHmoCosts,
    hmoBills: councilTax + utilities + water + broadband + cleaning + otherHmoCosts,
    btlRate: safe(num('strategyBtlRate')),
    hmoRate: safe(num('strategyHmoRate')),
    maintenanceVoidPercent: safe(num('strategyMaintenanceVoidPercent')),
    managementPercent: safe(num('strategyManagementPercent')),
    mortgageType: $('mortgageType')?.value || 'interest-only',
    mortgageTerm: Math.max(1, safe(num('mortgageTerm', 25), 25)),
    roomSizes,
    kitchenArea: safe(num('strategyKitchenArea')),
    communalArea: safe(num('strategyCommunalArea')),
    offerPrices: [1,2,3].map((i) => safe(num(`strategyOfferPrice${i}`)))
  };
}

function save(item) {
  if (!item) return;
  const store = readStore();
  store[item.id] = assumptions();
  writeStore(store);
}

function field(label, id, value, options = {}) {
  const prefix = options.prefix === undefined ? '£' : options.prefix;
  const suffix = options.suffix || '';
  const step = options.step || '1';
  const wrapper = prefix ? 'input-prefix' : 'forecast-suffix-input';
  return `<label class="field strategy-field"><span>${label}</span><span class="${wrapper}">${prefix ? `<span aria-hidden="true">${prefix}</span>` : ''}<input id="${id}" type="number" min="0" step="${step}" inputmode="decimal" value="${safe(value)}">${suffix ? `<span aria-hidden="true">${suffix}</span>` : ''}</span></label>`;
}

function inject() {
  ensureStylesheet();
  if ($('lettingStrategyComparison')) return;
  const anchor = document.querySelector('.assumptions-card');
  if (!anchor) return;
  const section = document.createElement('section');
  section.id = 'lettingStrategyComparison';
  section.className = 'forecast-card strategy-comparison-card';
  section.innerHTML = `<div class="forecast-section-heading strategy-heading"><div><p class="eyebrow">Letting strategy</p><h3>BTL vs 3 HMO vs 4 HMO</h3><p class="muted strategy-intro">Compare Year 1 rent, monthly costs and pre-tax cash flow using the same property and finance assumptions.</p></div><button id="resetStrategyBtn" class="secondary-btn compact-btn" type="button">Reset</button></div><div id="strategyInputArea"></div><div class="strategy-comparison-heading"><h4>Side-by-side comparison</h4><span class="muted tiny">Higher rent does not always mean higher cash flow.</span></div><div id="strategyCards" class="strategy-cards" aria-live="polite"></div><div id="strategyInsight" class="strategy-insight" aria-live="polite"></div><details class="strategy-details"><summary>HMO suitability screening</summary><div id="strategySuitabilityInputs" class="strategy-suitability-inputs"></div><div id="strategySuitabilityResult" class="strategy-suitability-result"></div><p class="muted tiny">Screening only. This does not confirm planning, licensing, fire-safety or HMO compliance. Verify the exact property with the relevant council and professional advisers.</p></details><details class="strategy-details"><summary>Offer price sensitivity</summary><div id="strategyOfferInputs" class="strategy-offer-inputs"></div><div id="strategyPriceTable" class="strategy-price-table-wrap"></div></details>`;
  anchor.insertAdjacentElement('afterend', section);
}

function populate(item, data) {
  $('strategyInputArea').innerHTML = `<div class="strategy-input-groups"><section class="strategy-input-group"><h4>Income</h4><div class="strategy-field-grid">${field('Family BTL rent / month','strategyFamilyRent',data.familyRent)}${field('Room 1 rent','strategyRoom1Rent',data.roomRents[0])}${field('Room 2 rent','strategyRoom2Rent',data.roomRents[1])}${field('Room 3 rent','strategyRoom3Rent',data.roomRents[2])}${field('Room 4 rent','strategyRoom4Rent',data.roomRents[3])}</div><div class="strategy-total-line"><span>3-HMO rent</span><strong id="strategyHmo3Rent">£0</strong><span>4-HMO rent</span><strong id="strategyHmo4Rent">£0</strong></div></section><section class="strategy-input-group"><h4>HMO household costs / month</h4><div class="strategy-field-grid">${field('Council tax','strategyCouncilTax',data.councilTax)}${field('Gas & electricity','strategyUtilities',data.utilities)}${field('Water','strategyWater',data.water)}${field('Broadband','strategyBroadband',data.broadband)}${field('Cleaning','strategyCleaning',data.cleaning)}${field('Other HMO costs','strategyOtherHmoCosts',data.otherHmoCosts)}</div><div class="strategy-total-line"><span>Total HMO bills</span><strong id="strategyHmoBills">£0</strong></div></section><section class="strategy-input-group"><h4>Finance & reserves</h4><div class="strategy-field-grid">${field('BTL mortgage rate','strategyBtlRate',data.btlRate,{prefix:'',suffix:'%',step:'0.1'})}${field('HMO mortgage rate','strategyHmoRate',data.hmoRate,{prefix:'',suffix:'%',step:'0.1'})}${field('Maintenance + void reserve','strategyMaintenanceVoidPercent',data.maintenanceVoidPercent,{prefix:'',suffix:'% rent',step:'0.5'})}${field('Management fee','strategyManagementPercent',data.managementPercent,{prefix:'',suffix:'% rent',step:'0.5'})}</div></section></div>`;
  $('strategySuitabilityInputs').innerHTML = `<div class="strategy-field-grid suitability-fields">${field('Bedroom 1','strategyRoom1Size',data.roomSizes[0],{prefix:'',suffix:'m²',step:'0.1'})}${field('Bedroom 2','strategyRoom2Size',data.roomSizes[1],{prefix:'',suffix:'m²',step:'0.1'})}${field('Bedroom 3','strategyRoom3Size',data.roomSizes[2],{prefix:'',suffix:'m²',step:'0.1'})}${field('Bedroom 4','strategyRoom4Size',data.roomSizes[3],{prefix:'',suffix:'m²',step:'0.1'})}${field('Kitchen area','strategyKitchenArea',data.kitchenArea,{prefix:'',suffix:'m²',step:'0.1'})}${field('Communal area after bedroom conversion','strategyCommunalArea',data.communalArea,{prefix:'',suffix:'m²',step:'0.1'})}</div>`;
  $('strategyOfferInputs').innerHTML = `<div class="strategy-field-grid offer-fields">${field('Offer scenario 1','strategyOfferPrice1',data.offerPrices[0],{step:'1000'})}${field('Offer scenario 2','strategyOfferPrice2',data.offerPrices[1],{step:'1000'})}${field('Current / asking price','strategyOfferPrice3',data.offerPrices[2] || item.purchasePrice,{step:'1000'})}</div>`;
}

function strategyCard(title, subtitle, result, diffText = 'Family-let baseline') {
  return `<article class="strategy-card ${result.monthlyCashFlow < 0 ? 'strategy-card-negative' : ''}"><div class="strategy-card-title"><span>${subtitle}</span><h4>${title}</h4></div><div class="strategy-card-primary"><span>Monthly cash flow</span><strong class="${result.monthlyCashFlow < 0 ? 'negative-value' : ''}">${money(result.monthlyCashFlow)}</strong><small>${money(result.annualCashFlow)} / year</small></div><dl class="strategy-metrics"><div><dt>Rent</dt><dd>${money(result.monthlyRent)}</dd></div><div><dt>Mortgage</dt><dd>${money(result.mortgage)}</dd></div><div><dt>Household bills</dt><dd>${result.householdBills ? money(result.householdBills) : 'Tenant pays'}</dd></div><div><dt>Maintenance / void / management</dt><dd>${money(result.operatingReserve)}</dd></div><div class="strategy-cost-total"><dt>Total monthly costs</dt><dd>${money(result.totalMonthlyCost)}</dd></div><div><dt>Gross yield</dt><dd>${pct(result.grossYield)}</dd></div><div><dt>Cash-on-cash</dt><dd>${pct(result.cashOnCash)}</dd></div></dl><p class="strategy-difference">${diffText}</p></article>`;
}

function diffText(result) {
  const diff = result.differenceVsBtl;
  if (Math.abs(diff) < 1) return 'Broadly level with BTL cash flow.';
  return `${money(Math.abs(diff))}/month ${diff > 0 ? 'more' : 'less'} cash flow than BTL.`;
}

function screenRows(result) {
  const text = { pass:'Pass', close:'Close - check', fail:'Below benchmark', unknown:'Enter size' };
  const row = (label, item, benchmarkLabel='Benchmark') => `<div><span>${label}</span><strong class="screen-${item.status}">${item.value ? `${item.value.toFixed(1)} m²` : '—'} · ${text[item.status]}</strong><small>${benchmarkLabel} ${item.minimum} m²</small></div>`;
  return [...result.bedrooms.map((item,index)=>row(`Bedroom ${index+1}`,item)), row('Kitchen',result.kitchen,'4-person benchmark'), row('Communal area',result.communal,'4-person benchmark')].join('');
}

function render() {
  const item = property();
  if (!item || !$('lettingStrategyComparison')) return;
  const input = assumptions();
  const comparison = compareLettingStrategies({ property:item, assumptions:input });
  $('strategyHmo3Rent').textContent = money(comparison.hmo3.monthlyRent);
  $('strategyHmo4Rent').textContent = money(comparison.hmo4.monthlyRent);
  $('strategyHmoBills').textContent = `${money(input.hmoBills)} / month`;
  $('strategyCards').innerHTML = strategyCard('Family BTL','Whole-property let',comparison.family) + strategyCard('3-Person HMO','Three separately rented rooms',comparison.hmo3,diffText(comparison.hmo3)) + strategyCard('4-Person HMO','Four separately rented rooms',comparison.hmo4,diffText(comparison.hmo4));
  const insight = (label,result) => `<div class="strategy-insight-row"><strong>${label}</strong><span>${result.differenceVsBtl >= 0 ? '+' : '−'}${money(Math.abs(result.differenceVsBtl))}/month ${result.differenceVsBtl >= 0 ? 'higher' : 'lower'} cash flow</span></div>`;
  $('strategyInsight').innerHTML = insight('3 HMO vs BTL',comparison.hmo3) + insight('4 HMO vs BTL',comparison.hmo4);

  const screening = evaluateHmoSuitability({ occupants:4, roomSizes:input.roomSizes, kitchenArea:input.kitchenArea, communalArea:input.communalArea });
  const label = screening.status === 'pass' ? 'Passes entered-size screening' : screening.status === 'fail' ? 'Does not pass entered-size screening' : 'Needs measurement / checking';
  $('strategySuitabilityResult').innerHTML = `<div class="strategy-screening-summary"><strong>${label}</strong><span>4-person HMO size screen</span></div><div class="strategy-screening-grid">${screenRows(screening)}</div>`;

  const rows = buildPriceSensitivity({ property:item, prices:input.offerPrices, assumptions:input });
  $('strategyPriceTable').innerHTML = `<table class="strategy-price-table"><thead><tr><th>Purchase price</th><th>BTL</th><th>3 HMO</th><th>4 HMO</th><th>4 HMO CoC</th></tr></thead><tbody>${rows.map((row)=>`<tr><td>${money(row.purchasePrice)}</td><td>${money(row.familyCashFlow)}/mo</td><td>${money(row.hmo3CashFlow)}/mo</td><td><strong>${money(row.hmo4CashFlow)}/mo</strong></td><td>${pct(row.hmo4CashOnCash)}</td></tr>`).join('')}</tbody></table>`;
}

function loadSelected() {
  const item = property();
  if (!item || !$('lettingStrategyComparison')) return;
  populate(item, load(item));
  render();
}
function resetSelected() {
  const item = property();
  if (!item) return;
  const store = readStore();
  delete store[item.id];
  writeStore(store);
  populate(item, defaults(item));
  render();
}
function init() {
  inject();
  loadSelected();
  document.addEventListener('input',(event)=>{ if(event.target.closest('#lettingStrategyComparison')){ save(property()); requestAnimationFrame(render); } });
  document.addEventListener('change',(event)=>{ if(event.target.id==='forecastProperty'){ requestAnimationFrame(loadSelected); } else if(event.target.closest('#lettingStrategyComparison')){ save(property()); requestAnimationFrame(render); } });
  document.addEventListener('click',(event)=>{ if(event.target.closest('#resetStrategyBtn')) resetSelected(); });
}

document.addEventListener('DOMContentLoaded', init);
