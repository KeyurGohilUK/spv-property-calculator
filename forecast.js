(() => {
'use strict';

const STORAGE_KEY = 'spv-property-calculator.properties.v1';
const FORECAST_KEY = 'spv-property-calculator.forecasts.v1';
const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
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

function money(value) { return currency.format(Number.isFinite(Number(value)) ? Number(value) : 0); }
function pct(value) { return `${percent.format(Number.isFinite(Number(value)) ? Number(value) : 0)}%`; }
function num(id, fallback = 0) { const value = Number($(id)?.value); return Number.isFinite(value) ? value : fallback; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); }
function readProperties() { try { const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(data) ? data.filter((item) => !item.deletedAt) : []; } catch { return []; } }
function readForecasts() { try { const data = JSON.parse(localStorage.getItem(FORECAST_KEY) || '{}'); return data && typeof data === 'object' ? data : {}; } catch { return {}; } }
function writeForecasts(data) { try { localStorage.setItem(FORECAST_KEY, JSON.stringify(data)); } catch {} }

function purchaseNumbers(item) {
  const price = Math.max(0, Number(item?.purchasePrice) || 0);
  const depositPercent = clamp(item?.depositPercent ?? 25, 0, 100);
  const deposit = price * depositPercent / 100;
  const mortgage = Math.max(0, price - deposit);
  const calc = item?.calculated || {};
  const cash = Number(calc.totalCashRequired) || deposit + Number(calc.totalInvestmentCostsExcludingDeposit || 0);
  const refurbishment = Number(item?.refurbishmentCost) || Number(calc.refurbishment) || 0;
  return { price, deposit, mortgage, cash: Math.max(cash, deposit), refurbishment };
}

function defaultsFor(item) {
  const purchase = purchaseNumbers(item);
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
  const purchase = purchaseNumbers(property);
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
    rows.push({ year, value, grossRent, expenses, mortgagePayment: mortgage.payment, mortgageInterest: mortgage.interest, cashFlow, cumulativeCashFlow, balance, equity });
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
    return `<article class="stress-item ${cash < 0 ? 'negative' : ''}"><span>${rate}%</span><strong>${money(cash / 12)}</strong><small>/ month</small></article>`;
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
  $('exitResult').innerHTML = `<div><span>Projected sale price</span><strong>${money(last.value)}</strong></div><div><span>Mortgage to repay</span><strong>${money(last.balance)}</strong></div><div><span>Selling & legal costs</span><strong>${money(sellingFee + legal)}</strong></div><div><span>Estimated sale cash</span><strong>${money(saleCash)}</strong></div><div><span>Sale cash + rental cash flow</span><strong>${money(totalReceived)}</strong></div>`;
}

function renderRows(forecast) {
  $('forecastRows').innerHTML = forecast.rows.map((r) => `<tr><td>${r.year}</td><td>${money(r.value)}</td><td>${money(r.grossRent)}</td><td>${money(r.expenses)}</td><td>${money(r.mortgagePayment)}</td><td class="${r.cashFlow < 0 ? 'negative-value' : ''}">${money(r.cashFlow)}</td><td>${money(r.balance)}</td><td>${money(r.equity)}</td></tr>`).join('');
}

function render() {
  if (!property) return;
  saveAssumptions();
  const forecast = buildForecast();
  renderSummary(forecast);
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
  const items = readProperties();
  property = items.find((item) => item.id === id) || items[0] || null;
  if (!property) return;
  $('forecastProperty').value = property.id;
  loadAssumptions();
  render();
}

function populateProperties() {
  const items = readProperties();
  const select = $('forecastProperty');
  select.innerHTML = items.map((item) => `<option value="${String(item.id).replaceAll('"','&quot;')}">${String(item.title || 'Untitled Property').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</option>`).join('');
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