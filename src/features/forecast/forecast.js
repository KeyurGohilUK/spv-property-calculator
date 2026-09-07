import { getForecastProperties, getPurchaseNumbers } from './forecast-property.js';
import { escapeHtml, formatCurrency, formatPercentage, parseNumber } from '../../utils/format-utils.js';
import { setupDialog } from '../../components/dialog-helper.js';

(() => {
'use strict';

const FORECAST_KEY = 'spv-property-calculator.forecasts.v1';
const $ = (id) => document.getElementById(id);

let property = null;
let years = 10;

const DEFAULTS = Object.freeze({
  monthlyRent: 1500,
  mortgageType: 'interest-only',
  interestRate: 5.5,
  mortgageTerm: 25,
  rentGrowth: 2.5,
  propertyGrowth: 3,
  maintenancePercent: 8,
  managementPercent: 10,
  voidWeeks: 2,
  annualInsurance: 450,
  annualServiceCharge: 0,
  annualOtherCosts: 300,
  annualSpvAdmin: 600,
  postRefurbValue: 0,
  refinanceYear: 3,
  refinanceLtv: 75,
  sellingFeePercent: 1.5,
  exitLegalCost: 1500
});

const FIELD_IDS = [
  'monthlyRent','mortgageType','interestRate','mortgageTerm','rentGrowth','propertyGrowth',
  'maintenancePercent','managementPercent','voidWeeks','annualInsurance','annualServiceCharge',
  'annualOtherCosts','annualSpvAdmin','postRefurbValue','refinanceYear','refinanceLtv',
  'sellingFeePercent','exitLegalCost'
];

function money(value) { return formatCurrency(value); }
function pct(value) { return formatPercentage(value); }
function num(id, fallback = 0) { return parseNumber($(id)?.value, fallback); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); }
function readForecasts() { try { const data = JSON.parse(localStorage.getItem(FORECAST_KEY) || '{}'); return data && typeof data === 'object' ? data : {}; } catch { return {}; } }
function writeForecasts(data) { try { localStorage.setItem(FORECAST_KEY, JSON.stringify(data)); } catch {} }

function defaultsFor(item) {
  const purchase = getPurchaseNumbers(item);
  const existing = readForecasts()[item.id] || {};
  const suggestedRent = purchase.price ? Math.round((purchase.price * 0.065 / 12) / 25) * 25 : DEFAULTS.monthlyRent;
  return {
    ...DEFAULTS,
    monthlyRent: suggestedRent || DEFAULTS.monthlyRent,
    annualSpvAdmin: Number(item?.spvAdministrationCost) || DEFAULTS.annualSpvAdmin,
    postRefurbValue: purchase.refurbishment ? Math.round((purchase.price + purchase.refurbishment) / 1000) * 1000 : 0,
    ...existing
  };
}

function loadAssumptions() {
  if (!property) return;
  const data = defaultsFor(property);
  FIELD_IDS.forEach((id) => { if ($(id) && data[id] !== undefined) $(id).value = data[id]; });
  years = Number(data.years) || 10;
  updatePeriodButtons();
}

function saveAssumptions() {
  if (!property) return;
  const all = readForecasts();
  const data = { years };
  FIELD_IDS.forEach((id) => { data[id] = id === 'mortgageType' ? $(id).value : num(id); });
  all[property.id] = data;
  writeForecasts(all);
}

function repaymentPayment(balance, annualRate, termYears) {
  const months = Math.max(1, Math.round(termYears * 12));
  const monthlyRate = Math.max(0, annualRate) / 100 / 12;
  if (!monthlyRate) return balance / months;
  return balance * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months));
}

function annualMortgage(balance, annualRate, type, termYears, yearIndex) {
  if (balance <= 0) return { payment: 0, interest: 0, principal: 0, endBalance: 0 };
  if (type === 'interest-only') {
    const interest = balance * Math.max(0, annualRate) / 100;
    return { payment: interest, interest, principal: 0, endBalance: balance };
  }

  const monthlyRate = Math.max(0, annualRate) / 100 / 12;
  const paymentMonthly = repaymentPayment(balance, annualRate, Math.max(1, termYears - yearIndex));
  let end = balance;
  let interest = 0;
  let paid = 0;
  for (let month = 0; month < 12 && end > 0.01; month += 1) {
    const monthInterest = end * monthlyRate;
    const actual = Math.min(end + monthInterest, paymentMonthly);
    const principal = Math.max(0, actual - monthInterest);
    interest += monthInterest;
    paid += actual;
    end = Math.max(0, end - principal);
  }
  return { payment: paid, interest, principal: balance - end, endBalance: end };
}

function assumptions(overrides = {}) {
  return {
    monthlyRent: Math.max(0, num('monthlyRent')),
    mortgageType: $('mortgageType').value,
    interestRate: clamp(num('interestRate'), 0, 30),
    mortgageTerm: clamp(num('mortgageTerm'), 1, 50),
    rentGrowth: num('rentGrowth'),
    propertyGrowth: num('propertyGrowth'),
    maintenancePercent: clamp(num('maintenancePercent'), 0, 100),
    managementPercent: clamp(num('managementPercent'), 0, 100),
    voidWeeks: clamp(num('voidWeeks'), 0, 52),
    annualInsurance: Math.max(0, num('annualInsurance')),
    annualServiceCharge: Math.max(0, num('annualServiceCharge')),
    annualOtherCosts: Math.max(0, num('annualOtherCosts')),
    annualSpvAdmin: Math.max(0, num('annualSpvAdmin')),
    postRefurbValue: Math.max(0, num('postRefurbValue')),
    ...overrides
  };
}

function buildForecast(input = assumptions(), forecastYears = years) {
  const purchase = getPurchaseNumbers(property);
  const startValue = input.postRefurbValue > 0 ? input.postRefurbValue : purchase.price;
  let value = startValue;
  let balance = purchase.mortgage;
  let cumulativeCashFlow = 0;
  const rows = [];

  for (let year = 1; year <= forecastYears; year += 1) {
    const rentGrowth = Math.pow(1 + input.rentGrowth / 100, year - 1);
    const grossRent = input.monthlyRent * 12 * rentGrowth;
    const voidCost = grossRent * (input.voidWeeks / 52);
    const collectedRent = Math.max(0, grossRent - voidCost);
    const variableCosts = collectedRent * ((input.maintenancePercent + input.managementPercent) / 100);
    const fixedGrowth = Math.pow(1 + Math.max(0, input.rentGrowth) / 100, year - 1);
    const fixedCosts = (input.annualInsurance + input.annualServiceCharge + input.annualOtherCosts + input.annualSpvAdmin) * fixedGrowth;
    const expenses = variableCosts + fixedCosts + voidCost;
    const mortgage = annualMortgage(balance, input.interestRate, input.mortgageType, input.mortgageTerm, year - 1);
    const cashFlow = grossRent - expenses - mortgage.payment;
    cumulativeCashFlow += cashFlow;
    balance = mortgage.endBalance;
    value = startValue * Math.pow(1 + input.propertyGrowth / 100, year);
    const equity = Math.max(0, value - balance);
    rows.push({ year, value, grossRent, voidCost, variableCosts, fixedCosts, expenses, mortgagePayment: mortgage.payment, mortgageInterest: mortgage.interest, cashFlow, cumulativeCashFlow, balance, equity });
  }

  return { rows, purchase, startValue, final: rows[rows.length - 1] };
}

function renderSummary(forecast) {
  const first = forecast.rows[0];
  const last = forecast.final;
  const purchase = forecast.purchase;
  const initialCash = Math.max(1, purchase.cash);
  const year1NetBeforeFinance = first.grossRent - first.expenses;
  const capitalGain = last.value - forecast.startValue;
  const debtReduction = purchase.mortgage - last.balance;
  const totalReturn = last.cumulativeCashFlow + capitalGain + debtReduction;
  const grossYield = forecast.startValue ? first.grossRent / forecast.startValue * 100 : 0;
  const netYield = forecast.startValue ? year1NetBeforeFinance / forecast.startValue * 100 : 0;
  const cashOnCash = first.cashFlow / initialCash * 100;
  const paybackRow = forecast.rows.find((row) => row.cumulativeCashFlow >= initialCash);

  $('forecastSummaryTitle').textContent = `${years}-year outlook`;
  $('year1CashFlow').textContent = money(first.cashFlow);
  $('monthlyCashFlow').textContent = `${money(first.cashFlow / 12)} / month`;
  $('grossYield').textContent = pct(grossYield);
  $('netYield').textContent = pct(netYield);
  $('cashOnCash').textContent = pct(cashOnCash);
  $('projectedValue').textContent = money(last.value);
  $('projectedValueYear').textContent = `Year ${years}`;
  $('projectedEquity').textContent = money(last.equity);
  $('projectedMortgage').textContent = `Mortgage ${money(last.balance)}`;
  $('totalReturn').textContent = money(totalReturn);
  $('totalReturnPercent').textContent = `${pct(totalReturn / initialCash * 100)} on initial cash`;
  $('paybackPeriod').textContent = paybackRow ? `Year ${paybackRow.year}` : `>${years} years`;

  ['year1CashFlow','monthlyCashFlow','cashOnCash','totalReturn','totalReturnPercent'].forEach((id) => {
    $(id)?.classList.toggle('negative-value', id.includes('Percent') ? totalReturn < 0 : (id.includes('Cash') ? first.cashFlow < 0 : totalReturn < 0));
  });
}

function renderChart(forecast) {
  const rows = forecast.rows;
  const width = 760, height = 250, pad = 34;
  const max = Math.max(...rows.flatMap((r) => [r.value, r.equity, r.balance]), 1);
  const point = (r, key, index) => {
    const x = pad + (index / Math.max(1, rows.length - 1)) * (width - pad * 2);
    const y = height - pad - (r[key] / max) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const poly = (key) => rows.map((r, i) => point(r, key, i)).join(' ');
  const labels = [0, Math.floor((rows.length - 1) / 2), rows.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  $('forecastChart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true" preserveAspectRatio="none">
    <line x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}" class="chart-axis" />
    <polyline points="${poly('value')}" class="chart-line chart-value" />
    <polyline points="${poly('equity')}" class="chart-line chart-equity" />
    <polyline points="${poly('balance')}" class="chart-line chart-mortgage" />
    ${labels.map((i) => `<text x="${pad + (i / Math.max(1, rows.length - 1)) * (width - pad * 2)}" y="${height-10}" class="chart-label" text-anchor="middle">Y${rows[i].year}</text>`).join('')}
  </svg>`;
}

function scenarioCard(label, className, overrides) {
  const forecast = buildForecast(assumptions(overrides));
  const last = forecast.final;
  const total = last.cumulativeCashFlow + (last.value - forecast.startValue) + (forecast.purchase.mortgage - last.balance);
  return `<article class="scenario-card ${className}"><span>${label}</span><strong>${money(total)}</strong><div><small>Value</small><b>${money(last.value)}</b></div><div><small>Equity</small><b>${money(last.equity)}</b></div><div><small>Rental cash flow</small><b>${money(last.cumulativeCashFlow)}</b></div></article>`;
}

function renderScenarios() {
  const base = assumptions();
  $('scenarioGrid').innerHTML = [
    scenarioCard('Conservative', 'scenario-conservative', { propertyGrowth: Math.min(base.propertyGrowth, 1), rentGrowth: Math.min(base.rentGrowth, 1), interestRate: base.interestRate + 1, maintenancePercent: base.maintenancePercent + 2 }),
    scenarioCard('Expected', 'scenario-expected', {}),
    scenarioCard('Optimistic', 'scenario-optimistic', { propertyGrowth: Math.max(base.propertyGrowth, 5), rentGrowth: Math.max(base.rentGrowth, 4), interestRate: Math.max(0, base.interestRate - 0.75), maintenancePercent: Math.max(0, base.maintenancePercent - 1) })
  ].join('');
}

function yearOneCashFlowAtRate(rate) { return buildForecast(assumptions({ interestRate: rate }), 1).rows[0].cashFlow; }
function findBreakEvenRate() {
  let low = 0, high = 30;
  if (yearOneCashFlowAtRate(high) > 0) return null;
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    if (yearOneCashFlowAtRate(mid) >= 0) low = mid; else high = mid;
  }
  return (low + high) / 2;
}

function renderStress() {
  const rates = [3,4,5,6,7,8,9];
  $('stressGrid').innerHTML = rates.map((rate) => {
    const cash = yearOneCashFlowAtRate(rate);
    return `<article class="stress-item ${cash < 0 ? 'negative' : ''}"><span>${rate}% <button class="metric-help-btn" type="button" data-metric="mortgageStress" aria-label="Explain ${rate}% mortgage stress test">?</button></span><strong>${money(cash / 12)}</strong><small>/ month</small></article>`;
  }).join('');
  const breakEven = findBreakEvenRate();
  $('breakEvenRate').textContent = breakEven === null ? 'Break-even >30%' : `Break-even ${pct(breakEven)}`;
}

function renderRefinanceAndExit(forecast) {
  const refYear = clamp(Math.round(num('refinanceYear', 3)), 1, years);
  const ref = forecast.rows[refYear - 1];
  const ltv = clamp(num('refinanceLtv', 75), 0, 95) / 100;
  const newMortgage = ref.value * ltv;
  const release = Math.max(0, newMortgage - ref.balance);
  const remainingCash = Math.max(0, forecast.purchase.cash - release);
  $('refinanceYear').max = years;
  $('refinanceResult').innerHTML = `<div><span>Year ${refYear} value</span><strong>${money(ref.value)}</strong></div><div><span>Maximum mortgage at ${pct(ltv*100)}</span><strong>${money(newMortgage)}</strong></div><div><span>Potential cash released</span><strong>${money(release)}</strong></div><div><span>Initial cash remaining</span><strong>${money(remainingCash)}</strong></div>`;

  const last = forecast.final;
  const sellingFee = last.value * clamp(num('sellingFeePercent', 1.5), 0, 10) / 100;
  const legal = Math.max(0, num('exitLegalCost', 1500));
  const saleCash = last.value - last.balance - sellingFee - legal;
  const totalReceived = saleCash + last.cumulativeCashFlow;
  $('exitResult').innerHTML = `<div><span>Projected sale price</span><strong>${money(last.value)}</strong></div><div><span>Mortgage to repay</span><strong>${money(last.balance)}</strong></div><div><span>Selling & legal costs</span><strong>${money(sellingFee + legal)}</strong></div><div><span>Estimated pre-tax sale cash</span><strong>${money(saleCash)}</strong></div><div><span>Pre-tax sale cash + rental cash flow</span><strong>${money(totalReceived)}</strong></div>`;
}

function renderRows(forecast) {
  $('forecastRows').innerHTML = forecast.rows.map((r) => `<tr><td>${r.year}</td><td>${money(r.value)}</td><td>${money(r.grossRent)}</td><td>${money(r.expenses)}</td><td>${money(r.mortgagePayment)}</td><td class="${r.cashFlow < 0 ? 'negative-value' : ''}">${money(r.cashFlow)}</td><td>${money(r.balance)}</td><td>${money(r.equity)}</td></tr>`).join('');
}

function renderWaterfall(forecast) {
  const container = $('cashFlowWaterfall');
  if (!container) return;
  const first = forecast.rows[0];
  const inp = assumptions();
  const collected = first.grossRent - first.voidCost;
  const maintenanceCost = collected * inp.maintenancePercent / 100;
  const managementCost = collected * inp.managementPercent / 100;
  const netBeforeFinancing = first.grossRent - first.expenses;

  const wfRow = (label, value, cls) => {
    const neg = value < 0;
    return `<div class="wf-row ${cls}"><span>${label}</span><strong class="${neg ? 'negative-value' : ''}">${neg ? '−' : ''}£${Math.round(Math.abs(value)).toLocaleString('en-GB')}</strong></div>`;
  };

  container.innerHTML = [
    wfRow('Annual gross rent', first.grossRent, 'wf-income'),
    first.voidCost > 0.5 ? wfRow(`Void allowance (${inp.voidWeeks} wks)`, -first.voidCost, 'wf-deduct') : '',
    maintenanceCost > 0.5 ? wfRow(`Maintenance (${inp.maintenancePercent}%)`, -maintenanceCost, 'wf-deduct') : '',
    managementCost > 0.5 ? wfRow(`Management fee (${inp.managementPercent}%)`, -managementCost, 'wf-deduct') : '',
    first.fixedCosts > 0.5 ? wfRow('Insurance &amp; fixed overheads', -first.fixedCosts, 'wf-deduct') : '',
    `<div class="wf-row wf-sub"><span>Net income before financing</span><strong class="${netBeforeFinancing < 0 ? 'negative-value' : ''}">£${Math.round(Math.abs(netBeforeFinancing)).toLocaleString('en-GB')}</strong></div>`,
    wfRow(`Mortgage payment (${inp.mortgageType === 'interest-only' ? 'interest-only' : 'repayment'}, ${inp.interestRate}%)`, -first.mortgagePayment, 'wf-deduct'),
    `<div class="wf-divider"></div>`,
    `<div class="wf-row wf-total"><span>Year 1 pre-tax cash flow</span><strong class="${first.cashFlow < 0 ? 'negative-value' : ''}">£${Math.round(Math.abs(first.cashFlow)).toLocaleString('en-GB')}</strong></div>`,
    `<div class="wf-row wf-monthly"><span>Monthly</span><strong class="${first.cashFlow < 0 ? 'negative-value' : ''}">£${Math.round(Math.abs(first.cashFlow / 12)).toLocaleString('en-GB')}/mo</strong></div>`,
  ].join('');
}

const METRIC_HELP = {
  year1CashFlow: {
    eyebrow: 'Year 1',
    title: 'Pre-tax cash flow',
    body: `<p>The cash you keep after paying every running cost and the mortgage in Year 1, before corporation tax. This is the most direct measure of whether the property puts money in your pocket or requires a top-up each month.</p>
<div class="mhd-formula">
  <div class="mhd-row">Annual gross rent (monthly rent × 12)</div>
  <div class="mhd-row mhd-deduct">− Void allowance (rent lost to vacancy)</div>
  <div class="mhd-row mhd-deduct">− Maintenance (% of collected rent)</div>
  <div class="mhd-row mhd-deduct">− Management fee (% of collected rent)</div>
  <div class="mhd-row mhd-deduct">− Fixed overheads (insurance, service charge, other, SPV admin)</div>
  <div class="mhd-row mhd-deduct">− Mortgage payment (interest or interest + principal)</div>
  <div class="mhd-row mhd-total">= Year 1 pre-tax cash flow</div>
</div>
<p class="mhd-tip"><strong>UK average:</strong> A typical leveraged UK BTL generates £100–£300/month positive cash flow, though this varies widely by region and LTV. Properties in London often run at £0–£100/month or even negative; Northern cities typically achieve £200–£500/month.</p>
<p class="mhd-tip"><strong>Below average (under £100/mo):</strong> Thin margins — a single void period or boiler repair could turn it negative. Review your void allowance and ensure you have a cash reserve. <strong>Negative:</strong> You are topping up monthly; ensure capital growth justifies the shortfall. <strong>Above average (£300+/mo):</strong> Strong cash flow; good resilience to rate rises and unexpected costs. See the full breakdown in the "Show Year 1 cash flow breakdown" section below the cards.</p>`,
  },
  grossYield: {
    eyebrow: 'Year 1',
    title: 'Gross yield',
    body: `<p>Annual rent expressed as a percentage of the property's starting value. No costs are deducted — it is a raw income-to-value ratio used to quickly compare properties or screen a market.</p>
<div class="mhd-formula">
  <div class="mhd-row">Annual gross rent (monthly rent × 12)</div>
  <div class="mhd-row mhd-divider">÷ Starting property value</div>
  <div class="mhd-row mhd-total">= Gross yield %</div>
</div>
<p class="mhd-tip"><strong>UK average:</strong> The national average gross yield sits around 4.5–5.5% (Savills/Rightmove data). London and the South East typically yield 3–4%; Midlands, North West, and Wales 6–8%; some higher-risk areas above 8%.</p>
<p class="mhd-tip"><strong>Below average (under 4%):</strong> Low income relative to asset value — you are relying heavily on capital appreciation. Ensure your growth assumption is realistic for the area. <strong>4–7%:</strong> Standard BTL territory; healthy income base. <strong>Above 7%:</strong> High yield — often signals lower-value areas, HMOs, or serviced accommodation; verify tenant demand and management costs before committing.</p>`,
  },
  netYield: {
    eyebrow: 'Year 1',
    title: 'Net yield',
    body: `<p>Annual rent minus all running costs — void, maintenance, management fee, and fixed overheads — expressed as a percentage of starting value. Mortgage financing is deliberately excluded so you can compare properties regardless of how they are funded.</p>
<div class="mhd-formula">
  <div class="mhd-row">Annual gross rent</div>
  <div class="mhd-row mhd-deduct">− Void, maintenance, management, fixed overheads</div>
  <div class="mhd-row mhd-sub">= Net operating income</div>
  <div class="mhd-row mhd-divider">÷ Starting property value</div>
  <div class="mhd-row mhd-total">= Net yield %</div>
</div>
<p class="mhd-tip"><strong>UK average:</strong> Net yield is typically 1.5–2% lower than gross yield. A well-run UK BTL typically nets 3–5%. The gap between gross and net reflects your running cost burden — a large gap often means high management fees, service charges, or maintenance costs.</p>
<p class="mhd-tip"><strong>Below 3%:</strong> Very thin net income; the property is close to breakeven on income alone — financing costs will likely push it into loss. <strong>3–5%:</strong> Solid for UK residential BTL; covers a reasonable mortgage. <strong>Above 5%:</strong> Strong net income, particularly for a single-let; gives good headroom after financing. Use this number — not gross yield — to compare properties with different cost profiles.</p>`,
  },
  cashOnCash: {
    eyebrow: 'Year 1',
    title: 'Pre-tax cash-on-cash return',
    body: `<p>Year 1 cash flow expressed as a percentage of the total cash you physically invested — deposit plus SDLT, legal fees, and refurbishment. It measures how efficiently your capital is working in Year 1.</p>
<div class="mhd-formula">
  <div class="mhd-row">Year 1 pre-tax cash flow</div>
  <div class="mhd-row mhd-divider">÷ Total cash invested (deposit + SDLT + legal + refurb)</div>
  <div class="mhd-row mhd-total">= Cash-on-cash return %</div>
</div>
<p class="mhd-tip"><strong>UK average:</strong> A commonly cited target for UK BTL is 4–8% cash-on-cash in Year 1. Properties at 70% LTV in a standard market often land at 3–6%; lower LTVs compress returns; higher yields or BRRR-recycled capital can push above 10%.</p>
<p class="mhd-tip"><strong>Negative:</strong> The property is costing you money in Year 1 relative to your invested capital. <strong>0–4%:</strong> Weak cash return — compare to the risk-free rate (UK base rate or ISA); the investment case rests on capital growth. <strong>4–8%:</strong> Healthy range for leveraged BTL. <strong>Above 8%:</strong> Strong; typical of high-yield areas or where capital has been efficiently recycled via refinancing. The total cash invested figure comes from your saved property calculation.</p>`,
  },
  projectedValue: {
    eyebrow: 'End of forecast period',
    title: 'Projected value',
    body: `<p>The estimated market value of the property at the end of the forecast period, calculated by compounding the annual growth rate you have entered in assumptions.</p>
<div class="mhd-formula">
  <div class="mhd-row">Starting value × (1 + annual growth %) ^ number of years</div>
  <div class="mhd-row mhd-total">= Projected value</div>
</div>
<p class="mhd-tip"><strong>UK long-run average:</strong> UK house prices have grown at roughly 4% per year since 1983 (Halifax HPI). London has averaged ~5–6%; regional UK ~3–4%. Over 10 years, 4% annual growth roughly doubles a property's value.</p>
<p class="mhd-tip"><strong>If your growth assumption is below 2%:</strong> Conservative scenario — good for stress testing. <strong>3–4%:</strong> In line with long-run UK averages; a reasonable central case. <strong>Above 5%:</strong> Optimistic; above 7% is aggressive and should be treated as a best-case scenario only. A 1% change in assumed growth rate has a large compounding effect over 10+ years — use 1%, 3%, and 5% to model a range of outcomes.</p>`,
  },
  projectedEquity: {
    eyebrow: 'End of forecast period',
    title: 'Projected equity',
    body: `<p>The net wealth tied up in the property: projected value minus the outstanding mortgage balance at the end of the period.</p>
<div class="mhd-formula">
  <div class="mhd-row">Projected property value</div>
  <div class="mhd-row mhd-deduct">− Remaining mortgage balance</div>
  <div class="mhd-row mhd-total">= Projected equity</div>
</div>
<p class="mhd-tip"><strong>Typical target:</strong> On a 10-year hold at 4% annual growth and 70% LTV (interest-only), starting equity of ~30% of value should roughly double in cash terms by end of period. On a repayment mortgage, equity grows faster due to simultaneous balance reduction.</p>
<p class="mhd-tip"><strong>If closing equity is lower than opening equity:</strong> Capital growth is not keeping pace — check whether your growth assumption is too low or the mortgage balance is unusually high. <strong>Equity growing steadily:</strong> The property is building wealth as expected. <strong>For interest-only mortgages:</strong> All equity growth comes from value appreciation alone — any period of flat or falling prices will stall it entirely. The "Mortgage £x" figure beneath the number shows the remaining balance so you can see both sides.</p>`,
  },
  totalReturn: {
    eyebrow: 'Across the full forecast period',
    title: 'Total projected pre-tax return',
    body: `<p>The sum of three separate value sources accumulated over the entire forecast period, before corporation tax and capital gains tax on disposal.</p>
<div class="mhd-formula">
  <div class="mhd-row">Cumulative rental cash flow (sum of all years)</div>
  <div class="mhd-row mhd-row">+ Capital gain (final value − starting value)</div>
  <div class="mhd-row mhd-row">+ Debt reduction (principal repaid — repayment mortgages only)</div>
  <div class="mhd-row mhd-total">= Total projected pre-tax return</div>
</div>
<p class="mhd-tip"><strong>UK average:</strong> Leveraged UK BTL has historically delivered total annualised returns of 8–12% on initial equity (MSCI UK Property data), driven predominantly by capital growth. The "% on initial cash" figure below the number shows your implied annualised CAGR — 8–10% is broadly in line with historical averages.</p>
<p class="mhd-tip"><strong>Below 5% annualised:</strong> Underperforming many passive alternatives (e.g. global equity index funds); reconsider whether the illiquidity and management burden are justified. <strong>8–12% annualised:</strong> In line with long-run UK BTL averages. <strong>Above 15% annualised:</strong> Strong — often reflects high leverage, high-growth assumptions, or a BRRR-style deal. Capital gain typically dominates over longer periods; the advanced metrics below the chart break the return into its three components.</p>`,
  },
  paybackPeriod: {
    eyebrow: 'Rental cash flow only',
    title: 'Cash-flow payback',
    body: `<p>The year in which your cumulative rental profit — the running total of Year 1 + Year 2 + … cash flows — first reaches or exceeds the total cash you originally invested.</p>
<div class="mhd-formula">
  <div class="mhd-row">Find the first year where:</div>
  <div class="mhd-row mhd-sub">Sum of all cash flows to date ≥ Total cash invested</div>
  <div class="mhd-row mhd-total">= Payback year</div>
</div>
<p class="mhd-tip"><strong>UK average:</strong> A typical leveraged UK BTL sees rental cash-flow payback in 8–15 years. High-yield northern properties may achieve 6–9 years; London or low-yield properties often show ">10 years" or never within a standard 10-year forecast.</p>
<p class="mhd-tip"><strong>Under 8 years:</strong> Strong cash-flow property — income is a major driver of return. <strong>8–15 years:</strong> Normal range for a balanced BTL. <strong>Over 15 years / never shown:</strong> The investment is almost entirely capital-growth driven — rental income alone will not return your deposit within the forecast period. This is not necessarily a problem but requires conviction in long-term value appreciation. This metric excludes capital growth and debt reduction — always read alongside projected equity and total return.</p>`,
  },
  mortgageStress: {
    eyebrow: 'Mortgage-rate stress test',
    title: 'Interest-rate scenario',
    body: `<p>This card shows the estimated Year 1 monthly cash flow if your mortgage interest rate were at this percentage. Everything else — rent, running costs, void allowance — stays the same as your main assumptions. Only the interest rate changes.</p>
<div class="mhd-formula">
  <div class="mhd-row">Annual gross rent</div>
  <div class="mhd-row mhd-deduct">− All running costs (same as main forecast)</div>
  <div class="mhd-row mhd-deduct">− Mortgage interest at this stress rate</div>
  <div class="mhd-row mhd-total">= Monthly cash flow at this rate</div>
</div>
<p class="mhd-tip"><strong>Industry benchmark:</strong> UK BTL lenders typically stress-test affordability at 5.5% with a 1.25× ICR requirement. A property that remains cash-flow positive at 5.5% passes the standard underwriting hurdle. Base rates peaked at 5.25% in 2023–24, so rates in the 5–6% range are a realistic near-term scenario rather than an extreme stress.</p>
<p class="mhd-tip"><strong>Card turns red below your current rate:</strong> Margins are already tight — be cautious. <strong>Positive at 5.5%:</strong> Passes the standard lender stress test. <strong>Positive at 7%+:</strong> Well-buffered against significant further rate rises; a resilient deal. <strong>The "Break-even" pill</strong> above the grid shows the exact rate at which cash flow hits zero.</p>`,
  },
  rentStress: {
    eyebrow: 'Rent & occupancy stress test',
    title: 'Rent multiple scenario',
    body: `<p>This card shows Year 1 monthly cash flow if your rent were at this percentage of your assumed rent. The 100% card reflects your current assumption; cards below 100% model underperformance (lower rent achieved or higher voids); cards above model upside.</p>
<div class="mhd-formula">
  <div class="mhd-row">Monthly rent × this multiple = stressed rent</div>
  <div class="mhd-row mhd-deduct">− Running costs recalculated on stressed rent</div>
  <div class="mhd-row mhd-deduct">− Mortgage payment (unchanged)</div>
  <div class="mhd-row mhd-total">= Monthly cash flow at this rent</div>
</div>
<p class="mhd-tip"><strong>Industry benchmark:</strong> A well-underwritten BTL should survive the 90% card (i.e. tolerate a 10% rent shortfall from lower achieved rent or additional void). Survives 80%: excellent resilience — this property can withstand a significant rental downturn and still break even.</p>
<p class="mhd-tip"><strong>Turns red at 100% or above:</strong> The property is already marginal or loss-making on your current assumptions — review your rent estimate and cost inputs before proceeding. <strong>Positive at 90%:</strong> Acceptable resilience; passes a standard commercial stress test. <strong>Positive at 80%:</strong> Strong margin of safety against void and below-market rent. <strong>110–120% cards:</strong> Upside scenario — useful if you plan a refurbishment or believe the market rent is conservatively estimated.</p>`,
  },
  icr: {
    eyebrow: 'Rental risk',
    title: 'Interest cover ratio (ICR)',
    body: `<p>Net operating income divided by annual mortgage interest. It measures how many times the rental profit covers the interest cost — independent of whether your mortgage is interest-only or repayment.</p>
<div class="mhd-formula">
  <div class="mhd-row">Net operating income (gross rent − all running costs)</div>
  <div class="mhd-row mhd-divider">÷ Annual mortgage interest</div>
  <div class="mhd-row mhd-total">= ICR (× times covered)</div>
</div>
<p class="mhd-tip"><strong>UK lender benchmark:</strong> Most BTL lenders require ICR ≥ 1.25× tested at a stress rate of 5.5% (higher for Ltd Co / SPV: some lenders require 1.25–1.45×). This is a hard underwriting threshold — falling below it at 5.5% typically means the lender will not offer the requested mortgage.</p>
<p class="mhd-tip"><strong>Below 1.0×:</strong> Interest is not covered by income — the property is operationally loss-making before any principal repayment. <strong>1.0–1.25×:</strong> Marginal; likely to fail lender stress tests. <strong>1.25–1.5×:</strong> Meets minimum lender requirements — acceptable but limited headroom. <strong>1.5–2.0×:</strong> Healthy; comfortable buffer against rate rises or increased costs. <strong>Above 2.0×:</strong> Very strong income coverage; resilient to a wide range of stress scenarios.</p>`,
  },
  dscr: {
    eyebrow: 'Rental risk',
    title: 'Debt-service cover ratio (DSCR)',
    body: `<p>Net operating income divided by the full annual mortgage payment — interest plus any principal repayment. DSCR is stricter than ICR because it measures whether income covers the entire debt obligation, not just the interest portion.</p>
<div class="mhd-formula">
  <div class="mhd-row">Net operating income (gross rent − all running costs)</div>
  <div class="mhd-row mhd-divider">÷ Total mortgage payment (interest + principal)</div>
  <div class="mhd-row mhd-total">= DSCR (× times covered)</div>
</div>
<p class="mhd-tip"><strong>Typical range:</strong> For a repayment mortgage, DSCR of 1.0–1.3× is common in UK residential BTL. On an interest-only mortgage DSCR equals ICR (no principal component). Commercial lenders and some specialist BTL lenders use DSCR ≥ 1.25× as their minimum.</p>
<p class="mhd-tip"><strong>Below 1.0×:</strong> Operating income does not cover the full mortgage repayment — you must top up from other income each month. <strong>1.0–1.25×:</strong> Breakeven or marginal; any reduction in rent or increase in costs turns it negative. <strong>1.25–1.5×:</strong> Healthy — covers the full debt service with a meaningful buffer. <strong>Above 1.5×:</strong> Strong; particularly notable on a repayment mortgage where the principal component is a real cash cost.</p>`,
  },
  breakEvenOccupancy: {
    eyebrow: 'Rental risk',
    title: 'Break-even occupancy',
    body: `<p>The minimum percentage of the year the property needs to be tenanted — at your assumed rent — to cover all costs including the mortgage. It is derived from the break-even rent calculation.</p>
<div class="mhd-formula">
  <div class="mhd-row">Break-even monthly rent ÷ assumed monthly rent</div>
  <div class="mhd-row mhd-sub">× (1 − void weeks / 52)</div>
  <div class="mhd-row mhd-total">= Break-even occupancy %</div>
</div>
<p class="mhd-tip"><strong>UK average void rate:</strong> Residential BTL properties are typically vacant for 3–5 weeks per year, implying ~91–94% average occupancy. A well-managed property in high-demand areas may run at 96–98%; harder-to-let properties or HMOs may see 85–90%.</p>
<p class="mhd-tip"><strong>Break-even below 85%:</strong> Excellent — you could sustain 8+ weeks of vacancy per year and still break even; very resilient. <strong>85–92%:</strong> Reasonable buffer; in line with typical UK vacancy rates. <strong>92–96%:</strong> Thin — a single void period pushes you into loss; ensure you have a cash reserve. <strong>Above 96%:</strong> Very high risk — almost any tenant gap will cost you money; the deal is too tight to absorb normal rental market risk. Compare to your "Void Allowance" input — if the void you have already budgeted exceeds the break-even threshold, the property will lose money in an average year.</p>`,
  },
  ltvTrajectory: {
    eyebrow: 'Capital structure',
    title: 'LTV now → end',
    body: `<p>Loan-to-value at the start of the forecast versus at the end. It shows how the debt-to-value ratio changes over time as the property value grows and — on a repayment mortgage — the outstanding balance falls.</p>
<div class="mhd-formula">
  <div class="mhd-row">Starting mortgage ÷ starting property value = opening LTV</div>
  <div class="mhd-row mhd-row">Remaining balance ÷ projected end value = closing LTV</div>
</div>
<p class="mhd-tip"><strong>UK BTL benchmark:</strong> Most BTL mortgages are available up to 75% LTV; some specialist lenders go to 80%. A standard purchase sits at 65–75% LTV. Remortgaging headroom is typically greatest below 65% LTV, where the widest range of products is available.</p>
<p class="mhd-tip"><strong>Opening LTV above 75%:</strong> High leverage — limited product choice and greater sensitivity to value falls. <strong>65–75%:</strong> Standard BTL range; good product availability. <strong>Below 60%:</strong> Low leverage; maximum refinancing headroom and lowest rates. <strong>Closing LTV falling significantly:</strong> Strong equity-building trajectory — good position for a future remortgage or portfolio expansion. <strong>Closing LTV flat or rising:</strong> On an interest-only mortgage the balance is fixed; if value growth stalls, LTV does not improve — this is the primary risk of an interest-only strategy in a flat market.</p>`,
  },
};

function setupMetricHelp() {
  const dialog = $('metricHelpDialog');
  if (!dialog) return;
  const controller = setupDialog(dialog, { closeButtons: [$('closeMetricHelpBtn')] });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.metric-help-btn');
    if (!btn) return;
    e.stopPropagation();
    const key = btn.dataset.metric;
    const help = METRIC_HELP[key];
    if (!help) return;
    $('metricHelpEyebrow').textContent = help.eyebrow;
    $('metricHelpTitle').textContent = help.title;
    $('metricHelpBody').innerHTML = help.body;
    controller.open(btn);
  });
}

function render() {
  if (!property) return;
  saveAssumptions();
  const forecast = buildForecast();
  renderSummary(forecast);
  renderWaterfall(forecast);
  renderChart(forecast);
  renderScenarios();
  renderStress();
  renderRefinanceAndExit(forecast);
  renderRows(forecast);
}

function updatePeriodButtons() {
  document.querySelectorAll('[data-years]').forEach((button) => button.classList.toggle('active', Number(button.dataset.years) === years));
}

function selectProperty(id) {
  const items = getForecastProperties();
  property = items.find((item) => item.id === id) || items[0] || null;
  if (!property) return;
  $('forecastProperty').value = property.id;
  loadAssumptions();
  render();
}

function populateProperties() {
  const items = getForecastProperties();
  const select = $('forecastProperty');
  select.innerHTML = items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title || 'Untitled Property')}</option>`).join('');
  $('forecastEmpty').classList.toggle('hidden', items.length > 0);
  $('forecastWorkspace').classList.toggle('hidden', items.length === 0);
  if (!items.length) return;
  const queryId = new URLSearchParams(location.search).get('property');
  selectProperty(queryId || items[0].id);
}

function resetCurrentForecast() {
  if (!property) return;
  const all = readForecasts();
  delete all[property.id];
  writeForecasts(all);
  loadAssumptions();
  render();
}

function init() {
  setupMetricHelp();
  populateProperties();
  $('forecastProperty').addEventListener('change', (event) => selectProperty(event.target.value));
  FIELD_IDS.forEach((id) => $(id)?.addEventListener('input', render));
  FIELD_IDS.forEach((id) => $(id)?.addEventListener('change', render));
  document.querySelectorAll('[data-years]').forEach((button) => button.addEventListener('click', () => {
    years = Number(button.dataset.years) || 10;
    updatePeriodButtons();
    render();
  }));
  $('resetForecastBtn').addEventListener('click', resetCurrentForecast);
}

document.addEventListener('DOMContentLoaded', init);
})();
