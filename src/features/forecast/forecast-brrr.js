import { BRRR_DEFAULTS, calcBrrr, calcBreakeven } from './brrr-calculations.js';

const BRRR_KEY = 'spv-property-calculator.brrr.v1';
const $ = (id) => document.getElementById(id);

const DEFAULTS = BRRR_DEFAULTS;

const FIELD_KEYS = [
  'gdv', 'refurbCost', 'monthlyRent', 'purchaseLtv', 'refinanceLtv',
  'mortgageRate', 'stressRate', 'icrRatio', 'purchaseCostsPct',
  'managementPct', 'refurbWeeks', 'minOffer', 'maxOffer', 'offerStep',
];
const FIELD_IDS = [
  'brrrGdv', 'brrrRefurbCost', 'brrrMonthlyRent', 'brrrPurchaseLtv', 'brrrRefinanceLtv',
  'brrrMortgageRate', 'brrrStressRate', 'brrrIcrRatio', 'brrrPurchaseCostsPct',
  'brrrManagementPct', 'brrrRefurbWeeks', 'brrrMinOffer', 'brrrMaxOffer', 'brrrOfferStep',
];

function readSaved() { try { return JSON.parse(localStorage.getItem(BRRR_KEY) || '{}') || {}; } catch { return {}; } }
function writeSaved(data) { try { localStorage.setItem(BRRR_KEY, JSON.stringify(data)); } catch {} }

function num(id, fallback = 0) {
  const v = parseFloat($(id)?.value);
  return isNaN(v) ? fallback : v;
}

function gbp(v) {
  return '£' + Math.round(Math.abs(v)).toLocaleString('en-GB');
}

function readInputs() {
  return Object.fromEntries(FIELD_KEYS.map((key, i) => [key, num(FIELD_IDS[i], DEFAULTS[key])]));
}

let selectedOffer = null;
let currentScenarios = [];
let currentInputs = {};

function render() {
  currentInputs = readInputs();
  const { minOffer, maxOffer, offerStep } = currentInputs;
  const step = Math.max(1000, Math.round(offerStep));
  const max = Math.max(minOffer + step, maxOffer);
  const offers = [];
  for (let o = Math.round(minOffer); o <= max + 0.01; o += step) {
    offers.push(Math.round(o));
    if (offers.length >= 30) break;
  }
  if (!offers.length) offers.push(Math.round(minOffer));

  const breakeven = calcBreakeven(currentInputs);
  currentScenarios = offers.map((o) => calcBrrr(o, currentInputs));

  if (selectedOffer === null || !offers.includes(selectedOffer)) {
    selectedOffer = offers.reduce(
      (best, o) => (Math.abs(o - breakeven) < Math.abs(best - breakeven) ? o : best),
      offers[Math.floor(offers.length / 2)],
    );
  }

  const pill = $('brrrBreakevenPrice');
  if (pill) {
    if (breakeven > 0) {
      pill.textContent = `Max to fully recycle: £${Math.round(breakeven).toLocaleString('en-GB')}`;
      pill.classList.remove('hidden');
    } else {
      pill.classList.add('hidden');
    }
  }

  renderTable(currentScenarios, breakeven);
  renderDetail(currentScenarios.find((s) => s.offerPrice === selectedOffer) || currentScenarios[0]);

  const toSave = Object.fromEntries(FIELD_KEYS.map((key, i) => [key, num(FIELD_IDS[i], DEFAULTS[key])]));
  writeSaved(toSave);
}

function renderTable(scenarios, breakeven) {
  const tbody = $('brrrRows');
  if (!tbody) return;

  tbody.innerHTML = scenarios.map((s) => {
    const isSelected = s.offerPrice === selectedOffer;
    const isRecycled = s.capitalLeft <= 0;
    const cls = [
      isSelected ? 'brrr-row-selected' : '',
      isRecycled ? 'brrr-row-recycled' : '',
    ].filter(Boolean).join(' ');
    const capCls = isRecycled ? 'brrr-positive' : s.capitalLeft > s.totalCashIn * 0.6 ? 'negative-value' : '';
    const cfCls = s.monthlyCashFlow < 0 ? 'negative-value' : '';
    const limitTag = s.icrIsBinding
      ? '<span class="brrr-constraint-tag brrr-icr">ICR</span>'
      : '<span class="brrr-constraint-tag brrr-ltv">LTV</span>';
    return `<tr class="${cls}" data-offer="${s.offerPrice}" tabindex="0" role="button" aria-label="View breakdown for £${s.offerPrice.toLocaleString('en-GB')} offer">
      <td>${isSelected ? '<strong>' : ''}£${s.offerPrice.toLocaleString('en-GB')}${isSelected ? '</strong>' : ''}</td>
      <td>£${Math.round(s.totalCashIn).toLocaleString('en-GB')}</td>
      <td>${limitTag} £${Math.round(s.refinanceMortgage).toLocaleString('en-GB')}</td>
      <td>£${Math.round(s.cashReleased).toLocaleString('en-GB')}</td>
      <td class="${capCls}">${isRecycled ? '✓ ' : ''}£${Math.round(Math.abs(s.capitalLeft)).toLocaleString('en-GB')}</td>
      <td class="${cfCls}">£${Math.round(s.monthlyCashFlow).toLocaleString('en-GB')}/mo</td>
      <td>${s.grossYield.toFixed(1)}%</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('tr[data-offer]').forEach((row) => {
    const selectRow = () => {
      selectedOffer = parseInt(row.dataset.offer, 10);
      renderTable(currentScenarios, calcBreakeven(currentInputs));
      renderDetail(currentScenarios.find((s) => s.offerPrice === selectedOffer));
      $('brrrDetailCard')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    row.addEventListener('click', selectRow);
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectRow(); } });
  });
}

function renderDetail(s) {
  const container = $('brrrDetail');
  const title = $('brrrDetailTitle');
  if (!container || !s) return;
  if (title) title.textContent = `Breakdown: £${s.offerPrice.toLocaleString('en-GB')} offer`;
  const inputs = currentInputs;
  const recycled = s.capitalLeft <= 0;

  container.innerHTML = `
    <div class="brrr-waterfall">
      <div class="brrr-waterfall-section">
        <h4 class="brrr-section-label">Purchase costs</h4>
        <div class="forecast-result-box">
          <div><span>Offer price</span><strong>£${s.offerPrice.toLocaleString('en-GB')}</strong></div>
          <div><span>Deposit (${100 - inputs.purchaseLtv}% equity, ${inputs.purchaseLtv}% LTV)</span><strong>£${Math.round(s.purchaseDeposit).toLocaleString('en-GB')}</strong></div>
          <div><span>SDLT &amp; legal (${inputs.purchaseCostsPct}% of offer)</span><strong>£${Math.round(s.purchaseCosts).toLocaleString('en-GB')}</strong></div>
          <div><span>Refurbishment budget</span><strong>£${Math.round(inputs.refurbCost).toLocaleString('en-GB')}</strong></div>
          <div><span>Carrying cost (${inputs.refurbWeeks} wks at ${inputs.mortgageRate}%)</span><strong>£${Math.round(s.carryingCost).toLocaleString('en-GB')}</strong></div>
        </div>
        <div class="brrr-section-total"><span>Total cash deployed</span><strong>${gbp(s.totalCashIn)}</strong></div>
      </div>

      <div class="brrr-waterfall-section">
        <h4 class="brrr-section-label">Refinance outcome</h4>
        <div class="forecast-result-box">
          <div><span>Post-refurb GDV</span><strong>£${Math.round(inputs.gdv).toLocaleString('en-GB')}</strong></div>
          <div><span>LTV cap (${inputs.refinanceLtv}% of GDV)</span><strong>£${Math.round(s.ltvLimit).toLocaleString('en-GB')}</strong></div>
          <div><span>ICR cap (${inputs.stressRate}% stress × ${inputs.icrRatio})</span><strong>£${Math.round(s.icrLimit).toLocaleString('en-GB')}</strong></div>
          <div class="${s.icrIsBinding ? 'brrr-binding-row' : ''}"><span>Effective refinance ${s.icrIsBinding ? '← ICR is tighter' : '← LTV is tighter'}</span><strong>£${Math.round(s.refinanceMortgage).toLocaleString('en-GB')}</strong></div>
          <div><span>Purchase mortgage to clear</span><strong>£${Math.round(s.purchaseMortgage).toLocaleString('en-GB')}</strong></div>
        </div>
        <div class="brrr-section-total"><span>Cash released</span><strong>${gbp(s.cashReleased)}</strong></div>
      </div>

      <div class="brrr-waterfall-section">
        <h4 class="brrr-section-label">Net position</h4>
        <div class="forecast-result-box">
          <div><span>Cash deployed</span><strong>£${Math.round(s.totalCashIn).toLocaleString('en-GB')}</strong></div>
          <div><span>Cash recycled at refinance</span><strong>£${Math.round(s.cashReleased).toLocaleString('en-GB')}</strong></div>
        </div>
        <div class="brrr-section-total ${recycled ? 'brrr-total-recycled' : ''}">
          <span>Capital left in deal</span>
          <strong class="${recycled ? 'brrr-positive' : ''}">${recycled ? '✓ ' : ''}£${Math.round(Math.abs(s.capitalLeft)).toLocaleString('en-GB')}${recycled && s.capitalLeft < 0 ? ' surplus' : ''}</strong>
        </div>
      </div>

      <div class="brrr-waterfall-section">
        <h4 class="brrr-section-label">Ongoing returns (post-refinance)</h4>
        <div class="forecast-result-box">
          <div><span>Annual gross rent</span><strong>£${Math.round(s.annualRent).toLocaleString('en-GB')}</strong></div>
          <div><span>Mortgage interest (${inputs.mortgageRate}% interest-only)</span><strong>−£${Math.round(s.annualMortgageInterest).toLocaleString('en-GB')}</strong></div>
          <div><span>Management fee (${inputs.managementPct}% of rent)</span><strong>−£${Math.round(s.annualManagement).toLocaleString('en-GB')}</strong></div>
        </div>
        <div class="brrr-section-total ${s.monthlyCashFlow < 0 ? 'brrr-total-negative' : ''}">
          <span>Monthly cash flow</span>
          <strong class="${s.monthlyCashFlow < 0 ? 'negative-value' : ''}">£${Math.round(s.monthlyCashFlow).toLocaleString('en-GB')}/mo</strong>
        </div>
        <div class="brrr-yield-row"><span>Gross yield</span><strong>${s.grossYield.toFixed(1)}%</strong></div>
        ${s.icrIsBinding ? `<p class="brrr-icr-note">ICR is the binding constraint — raising rent or negotiating a lower stress rate with your lender would increase the refinance amount.</p>` : ''}
      </div>
    </div>`;
}

function loadDefaults() {
  const saved = readSaved();
  FIELD_KEYS.forEach((key, i) => {
    const el = $(FIELD_IDS[i]);
    if (el) el.value = saved[key] !== undefined ? saved[key] : DEFAULTS[key];
  });
}

function init() {
  loadDefaults();

  FIELD_IDS.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', () => { selectedOffer = null; render(); });
    el.addEventListener('change', () => { selectedOffer = null; render(); });
  });

  const resetBtn = $('resetBrrrBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      FIELD_KEYS.forEach((key, i) => { const el = $(FIELD_IDS[i]); if (el) el.value = DEFAULTS[key]; });
      selectedOffer = null;
      writeSaved({});
      render();
    });
  }

  render();
}

init();
