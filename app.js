/*
 * SPV Property Calculator - browser bundle
 * This file intentionally uses NO ES-module imports so the app also works when
 * index.html is opened directly from a laptop using a file:// URL.
 * Source calculation/config/storage modules remain separate for maintainability/tests.
 */
(() => {
'use strict';

/**
 * SPV Property Calculator - SDLT configuration
 *
 * UPDATE UK TAX RATES HERE
 *
 * Current configuration is for residential property in England and Northern Ireland,
 * using rates effective from 1 April 2025 and the 5 percentage point higher-rate
 * surcharge applicable to company purchases, subject to transaction-specific rules.
 *
 * Certain corporate bodies buying dwellings for more than £500,000 can be charged a
 * 17% flat rate on the whole price. Relief may be available, including for qualifying
 * property rental businesses. The app exposes this assumption to the user.
 */

const TAX_CONFIG = Object.freeze({
  jurisdiction: 'England & Northern Ireland',
  taxName: 'Stamp Duty Land Tax (SDLT)',
  effectiveFrom: '2025-04-01',
  sourceChecked: '2026-08-12',

  // Standard residential bands from 1 April 2025.
  standardResidentialBands: Object.freeze([
    { from: 0, to: 125000, rate: 0.00 },
    { from: 125000, to: 250000, rate: 0.02 },
    { from: 250000, to: 925000, rate: 0.05 },
    { from: 925000, to: 1500000, rate: 0.10 },
    { from: 1500000, to: Infinity, rate: 0.12 }
  ]),

  // Company purchases generally attract the higher-rate surcharge when the
  // consideration is at least £40,000 and the statutory conditions are met.
  additionalPropertySurcharge: 0.05,
  higherRatesMinimumConsideration: 40000,

  // Certain corporate / non-natural-person transactions above £500,000 may be
  // subject to this flat whole-price rate unless a relief applies.
  corporateFlatRateThreshold: 500000,
  corporateFlatRate: 0.17,

  // Certain non-UK resident residential transactions can attract this surcharge.
  nonResidentSurcharge: 0.02
});



function safeNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === '') return 0;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, safeNumber(value)));
}

function calculateDeposit(purchasePrice, depositPercent) {
  const price = Math.max(0, safeNumber(purchasePrice));
  const percent = clamp(depositPercent, 0, 100);
  return price * (percent / 100);
}

function calculateMortgage(purchasePrice, depositAmount) {
  const price = Math.max(0, safeNumber(purchasePrice));
  const deposit = Math.max(0, safeNumber(depositAmount));
  return Math.max(0, price - deposit);
}

function progressiveTax(price, bands, surcharge = 0) {
  const breakdown = [];
  let total = 0;

  for (const band of bands) {
    if (price <= band.from) continue;
    const upper = Number.isFinite(band.to) ? Math.min(price, band.to) : price;
    const taxableAmount = Math.max(0, upper - band.from);
    if (taxableAmount <= 0) continue;

    const rate = band.rate + surcharge;
    const tax = taxableAmount * rate;
    total += tax;
    breakdown.push({
      from: band.from,
      to: band.to,
      taxableAmount,
      rate,
      tax
    });
  }

  return { total, breakdown };
}

/**
 * Calculates estimated SDLT for an SPV/company residential purchase.
 *
 * Options:
 * - qualifyingCorporateRelief (default true): when true, the app assumes the
 *   transaction qualifies for relief from the 17% corporate flat rate where relevant
 *   (e.g. qualifying property rental business) and uses progressive higher rates.
 * - nonResident: adds the 2 percentage point non-resident surcharge where applicable.
 */
function calculateSDLT(
  purchasePrice,
  { qualifyingCorporateRelief = true, nonResident = false } = {}
) {
  const price = Math.max(0, safeNumber(purchasePrice));
  if (price <= 0) {
    return { total: 0, breakdown: [], method: 'none', label: 'No SDLT', warnings: [] };
  }

  const nonResidentExtra = nonResident ? TAX_CONFIG.nonResidentSurcharge : 0;

  if (
    price > TAX_CONFIG.corporateFlatRateThreshold &&
    !qualifyingCorporateRelief
  ) {
    const rate = TAX_CONFIG.corporateFlatRate + nonResidentExtra;
    const total = price * rate;
    return {
      total,
      breakdown: [{ from: 0, to: price, taxableAmount: price, rate, tax: total }],
      method: 'corporate-flat-rate',
      label: `Corporate whole-price rate (${formatPercent(rate)})`,
      warnings: [
        'The 17% corporate rate can apply to certain company purchases over £500,000 when no qualifying relief applies.'
      ]
    };
  }

  const higherRatesApply = price >= TAX_CONFIG.higherRatesMinimumConsideration;
  const surcharge = (higherRatesApply ? TAX_CONFIG.additionalPropertySurcharge : 0) + nonResidentExtra;
  const result = progressiveTax(price, TAX_CONFIG.standardResidentialBands, surcharge);

  return {
    ...result,
    method: higherRatesApply ? 'company-higher-rates' : 'standard-bands',
    label: higherRatesApply
      ? `Company / additional-property bands${nonResident ? ' + non-resident surcharge' : ''}`
      : `Standard residential bands${nonResident ? ' + non-resident surcharge' : ''}`,
    warnings: []
  };
}

function calculateCostGroups(model = {}) {
  const legalProfessional =
    safeNumber(model.solicitorFee) + safeNumber(model.surveyCost);

  const mortgageCosts =
    safeNumber(model.mortgageArrangementFee) +
    safeNumber(model.mortgageBrokerFee) +
    safeNumber(model.mortgageValuationFee);

  const companyCosts =
    safeNumber(model.companyFormationCost) +
    safeNumber(model.spvAdministrationCost);

  const otherPurchaseCosts =
    safeNumber(model.landRegistrySearches) +
    safeNumber(model.insuranceCost) +
    safeNumber(model.auctionReservationFee) +
    (Array.isArray(model.customExpenses)
      ? model.customExpenses.reduce((sum, item) => sum + safeNumber(item.amount), 0)
      : 0);

  return { legalProfessional, mortgageCosts, companyCosts, otherPurchaseCosts };
}

function calculateProperty(model = {}) {
  const purchasePrice = Math.max(0, safeNumber(model.purchasePrice));
  const depositPercent = clamp(model.depositPercent ?? 25, 0, 100);
  const depositAmount = calculateDeposit(purchasePrice, depositPercent);
  const mortgageRequired = calculateMortgage(purchasePrice, depositAmount);
  const sdlt = calculateSDLT(purchasePrice, {
    qualifyingCorporateRelief: model.qualifyingCorporateRelief !== false,
    nonResident: Boolean(model.nonResident)
  });

  const groups = calculateCostGroups(model);
  const refurbishment = Math.max(0, safeNumber(model.refurbishmentCost));

  const feesExcludingDeposit =
    sdlt.total +
    groups.legalProfessional +
    groups.mortgageCosts +
    groups.companyCosts +
    groups.otherPurchaseCosts +
    refurbishment;

  const purchaseCostsExcludingDepositAndRefurb = feesExcludingDeposit - refurbishment;
  const totalCashRequired = depositAmount + feesExcludingDeposit;

  return {
    purchasePrice,
    depositPercent,
    depositAmount,
    mortgageRequired,
    sdlt,
    ...groups,
    refurbishment,
    totalPurchaseCostsExcludingDeposit: purchaseCostsExcludingDepositAndRefurb,
    totalPurchaseCostsIncludingDeposit: depositAmount + purchaseCostsExcludingDepositAndRefurb,
    totalInvestmentCostsExcludingDeposit: feesExcludingDeposit,
    totalCashRequired
  };
}

function formatPercent(rate) {
  const value = Number(rate) * 100;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

const STORAGE_KEY = 'spv-property-calculator.properties.v1';
const DELETED_KEY = 'spv-property-calculator.deleted.v1';

function makePropertyId() {
  return globalThis.crypto?.randomUUID?.() || `spv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Could not read saved properties:', error);
    return [];
  }
}

function writeRaw(properties) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(properties));
    return true;
  } catch (error) {
    console.error('Could not save properties:', error);
    return false;
  }
}

function replaceLocalProperties(properties) {
  return writeRaw(Array.isArray(properties) ? properties : []);
}

function readPendingDeletes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DELETED_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingDeletes(items) {
  try {
    localStorage.setItem(DELETED_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

function clearPendingDeletes(ids) {
  const set = new Set((ids || []).map(String));
  if (!set.size) return;
  writePendingDeletes(readPendingDeletes().filter((item) => !set.has(String(item.id))));
}
function clearPendingDelete(id) { clearPendingDeletes([id]); }
function getProperties() { return readRaw().sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0)); }
function getActiveProperties() { return getProperties().filter((item)=>!item.deletedAt); }
function getArchivedProperties() { return getProperties().filter((item)=>Boolean(item.deletedAt)).sort((a,b)=>new Date(b.deletedAt||b.updatedAt||0)-new Date(a.deletedAt||a.updatedAt||0)); }
function getProperty(id) { return readRaw().find((item)=>item.id===id) || null; }
function saveProperty(property) {
  const properties=readRaw(); const now=new Date().toISOString();
  const record={...property,id:property.id||makePropertyId(),createdAt:property.createdAt||now,updatedAt:now};
  const index=properties.findIndex((item)=>item.id===record.id); if(index>=0) properties[index]=record; else properties.push(record);
  if(!writeRaw(properties)) throw new Error('Unable to save. Your browser may have storage disabled or full.');
  clearPendingDelete(record.id); return record;
}
function archiveProperty(id) { const source=getProperty(id); if(!source) return null; return saveProperty({...source,deletedAt:new Date().toISOString()}); }
function restoreProperty(id) { const source=getProperty(id); if(!source) return null; return saveProperty({...source,deletedAt:null}); }

function duplicateProperty(id) {
  const source = getProperty(id);
  if (!source || source.deletedAt) return null;

  const now = new Date().toISOString();
  const copy = {
    ...source,
    id: makePropertyId(),
    title: `${source.title || 'Untitled Property'} (Copy)`,
    deletedAt: null,
    createdAt: now,
    updatedAt: now
  };

  const properties = readRaw();
  properties.push(copy);
  if (!writeRaw(properties)) return null;
  return copy;
}



const currency = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0
});

const numberFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const FEE_FIELDS = [
  'solicitorFee', 'surveyCost', 'mortgageArrangementFee', 'mortgageBrokerFee',
  'mortgageValuationFee', 'companyFormationCost', 'spvAdministrationCost',
  'landRegistrySearches', 'insuranceCost', 'auctionReservationFee', 'refurbishmentCost'
];

let editingId = null;
let editingCreatedAt = null;
let deferredInstallPrompt = null;
let cloudUser = null;
let cloudSyncing = false;
let cloudLastMessage = '';
let cloudInitialized = false;
let cloudListenerAttached = false;

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `expense-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const $ = (id) => document.getElementById(id);

function money(value) {
  return currency.format(Number.isFinite(Number(value)) ? Number(value) : 0);
}

function formatInputValue(value) {
  const numeric = safeNumber(value);
  return numeric === 0 ? '0' : numberFormat.format(numeric);
}

function getFormModel() {
  const customExpenses = [...document.querySelectorAll('.expense-row')].map((row) => ({
    id: row.dataset.id,
    name: row.querySelector('[data-expense-name]').value.trim(),
    amount: safeNumber(row.querySelector('[data-expense-amount]').value)
  }));

  const model = {
    id: editingId,
    createdAt: editingCreatedAt,
    title: $('title').value.trim(),
    details: $('details').value.trim(),
    purchasePrice: safeNumber($('purchasePrice').value),
    depositPercent: safeNumber($('depositPercent').value),
    qualifyingCorporateRelief: $('qualifyingCorporateRelief').checked,
    nonResident: $('nonResident').checked,
    customExpenses
  };

  for (const field of FEE_FIELDS) model[field] = safeNumber($(field).value);
  return model;
}

function renderCalculation() {
  const model = getFormModel();
  const calc = calculateProperty(model);

  $('depositAmountInline').textContent = money(calc.depositAmount);
  $('mortgageInline').textContent = money(calc.mortgageRequired);
  $('sdltInline').textContent = money(calc.sdlt.total);

  $('summaryPurchasePrice').textContent = money(calc.purchasePrice);
  $('summaryDepositPercent').textContent = `${numberFormat.format(calc.depositPercent)}%`;
  $('summaryDeposit').textContent = money(calc.depositAmount);
  $('summaryMortgage').textContent = money(calc.mortgageRequired);
  $('summarySDLT').textContent = money(calc.sdlt.total);
  $('summaryLegal').textContent = money(calc.legalProfessional);
  $('summaryMortgageCosts').textContent = money(calc.mortgageCosts);
  $('summaryCompanyCosts').textContent = money(calc.companyCosts);
  $('summaryOtherCosts').textContent = money(calc.otherPurchaseCosts);
  $('summaryRefurbishment').textContent = money(calc.refurbishment);
  $('summaryCostsExDeposit').textContent = money(calc.totalPurchaseCostsExcludingDeposit);
  $('summaryCostsIncDeposit').textContent = money(calc.totalPurchaseCostsIncludingDeposit);
  $('summaryTotalCash').textContent = money(calc.totalCashRequired);

  $('sdltMethod').textContent = `${calc.sdlt.label}. Rates configured from ${TAX_CONFIG.effectiveFrom}.`;
  $('sdltBreakdown').innerHTML = calc.sdlt.breakdown.length
    ? calc.sdlt.breakdown.map((band) => `
      <div class="tax-row">
        <span>${money(band.taxableAmount)} × ${formatPercent(band.rate)}</span>
        <strong>${money(band.tax)}</strong>
      </div>`).join('')
    : '<p class="muted small">No SDLT is currently calculated.</p>';

  if (calc.sdlt.warnings.length) {
    $('sdltBreakdown').insertAdjacentHTML('beforeend', calc.sdlt.warnings.map((warning) => `<p class="muted small">${warning}</p>`).join(''));
  }

  return { model, calc };
}

function addExpenseRow(expense = {}) {
  const id = expense.id || makeId();
  const row = document.createElement('div');
  row.className = 'expense-row';
  row.dataset.id = id;
  row.innerHTML = `
    <input data-expense-name type="text" maxlength="80" placeholder="Expense name" aria-label="Expense name" value="${escapeHtml(expense.name || '')}">
    <input data-expense-amount type="text" inputmode="decimal" placeholder="£0" aria-label="Expense amount" value="${expense.amount ? escapeHtml(formatInputValue(expense.amount)) : ''}">
    <button type="button" data-remove-expense aria-label="Remove expense">×</button>
  `;
  row.addEventListener('input', renderCalculation);
  row.querySelector('[data-remove-expense]').addEventListener('click', () => {
    row.remove();
    renderCalculation();
  });
  row.querySelector('[data-expense-amount]').addEventListener('blur', (event) => {
    const value = safeNumber(event.target.value);
    event.target.value = value ? formatInputValue(value) : '';
  });
  $('customExpenses').appendChild(row);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function validateForm() {
  const titleValid = $('title').value.trim().length > 0;
  const priceValid = safeNumber($('purchasePrice').value) > 0;
  const deposit = safeNumber($('depositPercent').value);
  const depositValid = deposit >= 0 && deposit <= 100;

  $('titleError').classList.toggle('hidden', titleValid);
  $('priceError').classList.toggle('hidden', priceValid);
  $('depositPercent').setCustomValidity(depositValid ? '' : 'Deposit must be between 0% and 100%.');

  if (!titleValid) $('title').focus();
  else if (!priceValid) $('purchasePrice').focus();
  else if (!depositValid) $('depositPercent').focus();

  return titleValid && priceValid && depositValid;
}

function resetForm() {
  editingId = null;
  editingCreatedAt = null;
  $('propertyForm').reset();
  $('depositPercent').value = '25';
  $('qualifyingCorporateRelief').checked = true;
  $('nonResident').checked = false;
  $('auctionReservationFee').value = '0';
  $('refurbishmentCost').value = '0';
  $('customExpenses').innerHTML = '';
  $('saveMessage').textContent = '';
  $('titleError').classList.add('hidden');
  $('priceError').classList.add('hidden');
  $('editorModeLabel').textContent = 'New calculation';
  renderCalculation();
}

function loadIntoForm(property) {
  resetForm();
  editingId = property.id;
  editingCreatedAt = property.createdAt || null;
  $('editorModeLabel').textContent = 'Editing saved property';

  $('title').value = property.title || '';
  $('details').value = property.details || '';
  $('purchasePrice').value = property.purchasePrice ? formatInputValue(property.purchasePrice) : '';
  $('depositPercent').value = property.depositPercent ?? 25;
  $('qualifyingCorporateRelief').checked = property.qualifyingCorporateRelief !== false;
  $('nonResident').checked = Boolean(property.nonResident);

  for (const field of FEE_FIELDS) {
    const value = safeNumber(property[field]);
    $(field).value = value ? formatInputValue(value) : (field === 'auctionReservationFee' || field === 'refurbishmentCost' ? '0' : '');
  }

  $('customExpenses').innerHTML = '';
  (property.customExpenses || []).forEach(addExpenseRow);
  renderCalculation();
}

function showHome() {
  $('editorView').classList.add('hidden');
  $('archiveView').classList.add('hidden');
  $('homeView').classList.remove('hidden');
  editingId = null;
  renderPropertyList(); renderArchiveList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showArchive() {
  $('homeView').classList.add('hidden'); $('editorView').classList.add('hidden'); $('archiveView').classList.remove('hidden');
  editingId = null; renderArchiveList(); window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showEditor(id = null) {
  $('homeView').classList.add('hidden'); $('archiveView').classList.add('hidden'); $('editorView').classList.remove('hidden');
  if (id) { const property=getProperty(id); if (property && !property.deletedAt) loadIntoForm(property); else resetForm(); } else resetForm();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function updatePropertyCounts() {
  const activeCount=getActiveProperties().length, archivedCount=getArchivedProperties().length;
  $('propertyCount').textContent=activeCount; $('archivedPropertyCount').textContent=archivedCount; $('archiveCountBadge').textContent=archivedCount;
}
function renderPropertyList() {
  const properties=getActiveProperties(); updatePropertyCounts(); $('emptyState').classList.toggle('hidden', properties.length>0); $('propertyList').innerHTML='';
  properties.forEach((property)=>{
    const calc=calculateProperty(property); const card=document.createElement('article'); card.className='property-card';
    card.innerHTML=`<div class="property-card-header"><div><h3>${escapeHtml(property.title||'Untitled Property')}</h3><p class="property-meta">Updated ${property.updatedAt?dateFormat.format(new Date(property.updatedAt)):'recently'}</p></div></div><div class="property-stats"><div><span>Purchase Price</span><strong>${money(calc.purchasePrice)}</strong></div><div><span>Deposit</span><strong>${numberFormat.format(calc.depositPercent)}% · ${money(calc.depositAmount)}</strong></div><div><span>Mortgage</span><strong>${money(calc.mortgageRequired)}</strong></div><div><span>Purchase Costs</span><strong>${money(calc.totalPurchaseCostsExcludingDeposit)}</strong></div></div><div class="property-total"><span>Total Cash Required</span><strong>${money(calc.totalCashRequired)}</strong></div><div class="card-actions"><button class="card-action" type="button" data-action="edit">Edit</button><button class="card-action" type="button" data-action="duplicate">Duplicate</button><button class="card-action delete" type="button" data-action="archive">Archive</button></div>`;
    card.addEventListener('click',(event)=>{ if(!event.target.closest('button')) showEditor(property.id); });
    card.querySelector('[data-action="edit"]').addEventListener('click',()=>showEditor(property.id));
    card.querySelector('[data-action="duplicate"]').addEventListener('click',async()=>{ const copy=duplicateProperty(property.id); if(!copy)return; renderPropertyList(); if(cloudUser&&navigator.onLine){try{await window.SPVCloud.upsertProperty(copy);setCloudMessage('Duplicate synced to Supabase.');}catch(error){console.warn('Cloud duplicate sync failed:',error);setCloudMessage('Duplicate saved locally; cloud sync is pending.',true);}} });
    card.querySelector('[data-action="archive"]').addEventListener('click',async()=>{ if(!window.confirm(`Move “${property.title||'this property'}” to Archived Properties? You can restore it later.`))return; const archived=archiveProperty(property.id); if(!archived)return; renderPropertyList();renderArchiveList(); if(cloudUser&&navigator.onLine){try{await window.SPVCloud.upsertProperty(archived);setCloudMessage('Property archived and synced to Supabase.');}catch(error){console.warn('Cloud archive sync failed:',error);setCloudMessage('Property archived locally; cloud sync will retry later.',true);}}else if(cloudUser){setCloudMessage('Property archived locally; it will sync when online.',true);} });
    $('propertyList').appendChild(card);
  });
}
function renderArchiveList() {
  const properties=getArchivedProperties(); updatePropertyCounts(); $('archiveEmptyState').classList.toggle('hidden',properties.length>0); $('archivePropertyList').innerHTML='';
  properties.forEach((property)=>{
    const calc=calculateProperty(property); const card=document.createElement('article'); card.className='property-card archived-card';
    card.innerHTML=`<div class="property-card-header"><div><div class="archive-label">Archived</div><h3>${escapeHtml(property.title||'Untitled Property')}</h3><p class="property-meta">Archived ${property.deletedAt?dateFormat.format(new Date(property.deletedAt)):'recently'}</p></div></div><div class="property-stats"><div><span>Purchase Price</span><strong>${money(calc.purchasePrice)}</strong></div><div><span>Deposit</span><strong>${numberFormat.format(calc.depositPercent)}% · ${money(calc.depositAmount)}</strong></div><div><span>Mortgage</span><strong>${money(calc.mortgageRequired)}</strong></div><div><span>Purchase Costs</span><strong>${money(calc.totalPurchaseCostsExcludingDeposit)}</strong></div></div><div class="property-total"><span>Total Cash Required</span><strong>${money(calc.totalCashRequired)}</strong></div><div class="archive-card-actions"><button class="primary-btn" type="button" data-action="restore">Restore Property</button></div>`;
    card.querySelector('[data-action="restore"]').addEventListener('click',async()=>{ const restored=restoreProperty(property.id); if(!restored)return; renderArchiveList();renderPropertyList(); if(cloudUser&&navigator.onLine){try{await window.SPVCloud.upsertProperty(restored);setCloudMessage('Property restored and synced to Supabase.');}catch(error){console.warn('Cloud restore sync failed:',error);setCloudMessage('Property restored locally; cloud sync will retry later.',true);}}else if(cloudUser){setCloudMessage('Property restored locally; it will sync when online.',true);} });
    $('archivePropertyList').appendChild(card);
  });
}

async function saveCurrentProperty() {
  if (!validateForm()) return;
  const { model, calc } = renderCalculation();
  try {
    const saved = saveProperty({ ...model, calculated: calc });
    editingId = saved.id;
    editingCreatedAt = saved.createdAt;
    $('editorModeLabel').textContent = 'Editing saved property';
    $('saveMessage').textContent = cloudUser
      ? (navigator.onLine ? 'Saved locally. Syncing…' : 'Saved locally. Will sync when online.')
      : 'Saved on this device.';

    if (cloudUser && navigator.onLine) {
      try {
        await window.SPVCloud.upsertProperty(saved);
        $('saveMessage').textContent = 'Saved locally and synced to Supabase.';
        setCloudMessage('Cloud is up to date.');
      } catch (cloudError) {
        console.warn('Cloud save failed:', cloudError);
        $('saveMessage').textContent = 'Saved locally. Cloud sync will retry later.';
        setCloudMessage('Cloud sync pending.', true);
      }
    }

    setTimeout(() => { $('saveMessage').textContent = ''; }, 3000);
  } catch (error) {
    $('saveMessage').textContent = error.message || 'Could not save this property.';
  }
}

function attachFormatting(input) {
  input.addEventListener('focus', () => {
    const value = safeNumber(input.value);
    input.value = value ? String(value) : '';
  });
  input.addEventListener('blur', () => {
    const value = safeNumber(input.value);
    input.value = value ? formatInputValue(value) : (input.id === 'auctionReservationFee' || input.id === 'refurbishmentCost' ? '0' : '');
    renderCalculation();
  });
}

function setCloudMessage(message, isWarning = false) {
  cloudLastMessage = message || '';
  renderCloudState(isWarning);
}

function renderCloudState(isWarning = false) {
  const cloud = window.SPVCloud;
  const state = cloud?.getConfigState?.() || { configured: false, available: false };
  const syncBtn = $('syncBtn');
  const accountBtn = $('accountBtn');

  $('cloudBar').classList.toggle('warning', Boolean(isWarning));

  if (!state.configured) {
    $('cloudStatusTitle').textContent = 'Cloud not configured';
    $('cloudStatusText').textContent = 'Edit supabase-config.js to enable free Supabase cloud storage.';
    accountBtn.textContent = 'Cloud setup';
    syncBtn.classList.add('hidden');
    return;
  }

  if (!state.available) {
    $('cloudStatusTitle').textContent = 'Cloud library unavailable';
    $('cloudStatusText').textContent = navigator.onLine
      ? 'Reload the page to retry loading Supabase.'
      : 'The calculator still works locally while offline.';
    accountBtn.textContent = 'Cloud';
    syncBtn.classList.add('hidden');
    return;
  }

  if (!cloudUser) {
    $('cloudStatusTitle').textContent = 'Local only';
    $('cloudStatusText').textContent = cloudLastMessage || 'Sign in to open the shared property workspace.';
    accountBtn.textContent = 'Sign in';
    syncBtn.classList.add('hidden');
    return;
  }

  accountBtn.textContent = 'Account';
  syncBtn.classList.remove('hidden');
  syncBtn.disabled = cloudSyncing || !navigator.onLine;
  syncBtn.textContent = cloudSyncing ? 'Syncing…' : 'Sync now';

  if (!navigator.onLine) {
    $('cloudStatusTitle').textContent = 'Offline — saved locally';
    $('cloudStatusText').textContent = 'Changes will sync to Supabase when this device is online again.';
    return;
  }

  $('cloudStatusTitle').textContent = 'Supabase connected';
  $('cloudStatusText').textContent = cloudLastMessage || `Shared workspace · signed in as ${cloudUser.email || 'your account'}.`;
}

function renderAuthDialog() {
  const cloud = window.SPVCloud;
  const state = cloud?.getConfigState?.() || { configured: false, available: false };
  const configured = state.configured && state.available;

  $('authNotConfigured').classList.toggle('hidden', configured);
  $('authSignedOut').classList.toggle('hidden', !configured || Boolean(cloudUser));
  $('authSignedIn').classList.toggle('hidden', !configured || !cloudUser);

  if (!configured) {
    const paragraph = $('authNotConfigured').querySelector('p:not(.eyebrow):not(.muted)');
    if (paragraph && state.configured && !state.available) {
      paragraph.innerHTML = 'Supabase is configured, but the browser library is unavailable. Check your internet connection and reload the page.';
    }
    return;
  }

  if (cloudUser) {
    $('signedInEmail').textContent = cloudUser.email || 'Signed-in Supabase user';
    $('dialogSyncBtn').disabled = cloudSyncing || !navigator.onLine;
    $('dialogSyncBtn').textContent = cloudSyncing ? 'Syncing…' : 'Sync now';
    $('accountSyncText').textContent = navigator.onLine
      ? (cloudLastMessage || 'All signed-in users share the same Supabase property list.')
      : 'Offline now. Local changes will be retained until the next sync.';
  }
}

function setAuthBusy(busy) {
  ['signInBtn', 'signUpBtn', 'signOutBtn', 'dialogSyncBtn'].forEach((id) => {
    const element = $(id);
    if (element) element.disabled = busy;
  });
}

async function syncCloud({ showFeedback = true } = {}) {
  if (cloudSyncing || !cloudUser || !window.SPVCloud?.syncAll) return false;
  if (!navigator.onLine) {
    setCloudMessage('Offline. Changes will sync automatically when online.', true);
    renderAuthDialog();
    return false;
  }

  cloudSyncing = true;
  renderCloudState();
  renderAuthDialog();
  if (showFeedback) $('signedInMessage').textContent = 'Syncing…';

  try {
    const result = await window.SPVCloud.syncAll(getProperties(), readPendingDeletes());
    if (!replaceLocalProperties(result.merged)) throw new Error('Could not update the local offline cache.');
    clearPendingDeletes(result.clearedDeleteIds || []);
    renderPropertyList();
    renderArchiveList();

    const changes = result.uploadedCount + result.downloadedCount + (result.archivedLegacyIds?.length || 0);
    const message = changes
      ? `Synced ${changes} change${changes === 1 ? '' : 's'} with Supabase.`
      : 'Cloud is up to date.';
    cloudLastMessage = message;
    if (showFeedback) $('signedInMessage').textContent = message;
    return true;
  } catch (error) {
    console.warn('Cloud sync failed:', error);
    cloudLastMessage = `Sync pending: ${error.message || 'Supabase could not be reached.'}`;
    if (showFeedback) $('signedInMessage').textContent = cloudLastMessage;
    return false;
  } finally {
    cloudSyncing = false;
    renderCloudState(!navigator.onLine);
    renderAuthDialog();
  }
}

async function handleSignIn() {
  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;
  if (!email || !password) {
    $('authMessage').textContent = 'Enter your email and password.';
    return;
  }

  setAuthBusy(true);
  $('authMessage').textContent = 'Signing in…';
  try {
    const data = await window.SPVCloud.signIn(email, password);
    cloudUser = data?.user || data?.session?.user || window.SPVCloud.getCurrentUser();
    $('authMessage').textContent = '';
    $('authPassword').value = '';
    renderCloudState();
    renderAuthDialog();
    await syncCloud({ showFeedback: false });
  } catch (error) {
    $('authMessage').textContent = error.message || 'Could not sign in.';
  } finally {
    setAuthBusy(false);
    renderAuthDialog();
  }
}

async function handleSignUp() {
  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;
  if (!email || password.length < 6) {
    $('authMessage').textContent = 'Enter a valid email and a password of at least 6 characters.';
    return;
  }

  setAuthBusy(true);
  $('authMessage').textContent = 'Creating account…';
  try {
    const data = await window.SPVCloud.signUp(email, password);
    if (data?.session?.user) {
      cloudUser = data.session.user;
      $('authMessage').textContent = '';
      $('authPassword').value = '';
      renderCloudState();
      renderAuthDialog();
      await syncCloud({ showFeedback: false });
    } else {
      $('authMessage').textContent = 'Account created. Confirm the email if your Supabase project requires email confirmation, then sign in.';
    }
  } catch (error) {
    $('authMessage').textContent = error.message || 'Could not create the account.';
  } finally {
    setAuthBusy(false);
    renderAuthDialog();
  }
}

async function handleSignOut() {
  setAuthBusy(true);
  $('signedInMessage').textContent = 'Signing out…';
  try {
    await window.SPVCloud.signOut();
    cloudUser = null;
    cloudLastMessage = 'Signed out. Your local offline copy is still on this device.';
    $('authDialog').close();
  } catch (error) {
    $('signedInMessage').textContent = error.message || 'Could not sign out.';
  } finally {
    setAuthBusy(false);
    renderCloudState();
    renderAuthDialog();
  }
}

async function setupCloud() {
  const cloud = window.SPVCloud;
  if (!cloud) {
    renderCloudState(true);
    return;
  }

  if (!cloudListenerAttached) {
    cloud.onAuthChange((user) => {
      window.setTimeout(() => {
        cloudUser = user || null;
        renderCloudState();
        renderAuthDialog();
        if (cloudUser && navigator.onLine) syncCloud({ showFeedback: false });
      }, 0);
    });
    cloudListenerAttached = true;
  }

  try {
    const state = await cloud.init();
    cloudInitialized = !state.configured || Boolean(state.available);
    cloudUser = state.user || null;
    renderCloudState();
    renderAuthDialog();
    if (cloudUser && navigator.onLine) await syncCloud({ showFeedback: false });
  } catch (error) {
    console.warn('Supabase initialization failed:', error);
    cloudInitialized = false;
    cloudLastMessage = error.message || 'Supabase initialization failed.';
    renderCloudState(true);
  }
}

function updateConnectionStatus() {
  const online = navigator.onLine;
  $('connectionStatus').textContent = online ? 'Online' : 'Offline';
  $('connectionStatus').classList.toggle('offline', !online);
  renderCloudState(!online && Boolean(cloudUser));
}

function setupInstall() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });

  $('installBtn').addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      return;
    }
    $('installDialog').showModal();
  });

  $('closeInstallDialog').addEventListener('click', () => $('installDialog').close());
}

function init() {
  $('newPropertyBtn').addEventListener('click', () => showEditor());
  $('archiveBtn').addEventListener('click', showArchive);
  $('archiveBackBtn').addEventListener('click', showHome);
  $('backBtn').addEventListener('click', showHome);
  $('addExpenseBtn').addEventListener('click', () => addExpenseRow());
  $('savePropertyBtn').addEventListener('click', saveCurrentProperty);

  $('accountBtn').addEventListener('click', () => {
    renderAuthDialog();
    $('authDialog').showModal();
  });
  $('closeAuthDialog').addEventListener('click', () => $('authDialog').close());
  $('signInBtn').addEventListener('click', handleSignIn);
  $('signUpBtn').addEventListener('click', handleSignUp);
  $('signOutBtn').addEventListener('click', handleSignOut);
  $('syncBtn').addEventListener('click', () => syncCloud());
  $('dialogSyncBtn').addEventListener('click', () => syncCloud());
  $('authPassword').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') handleSignIn();
  });

  $('propertyForm').addEventListener('input', renderCalculation);
  $('propertyForm').addEventListener('change', renderCalculation);

  [$('purchasePrice'), ...FEE_FIELDS.map((id) => $(id))].forEach(attachFormatting);

  window.addEventListener('online', () => {
    updateConnectionStatus();
    if (!cloudInitialized) setupCloud();
    else if (cloudUser) syncCloud({ showFeedback: false });
  });
  window.addEventListener('offline', updateConnectionStatus);

  // Small-team shared workspace: refresh periodically while the app is visible,
  // and once when the user returns to the app. This keeps other users' changes
  // appearing without requiring a manual reload.
  window.setInterval(() => {
    if (cloudUser && navigator.onLine && document.visibilityState !== 'hidden') {
      syncCloud({ showFeedback: false });
    }
  }, 45000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && cloudUser && navigator.onLine) {
      syncCloud({ showFeedback: false });
    }
  });

  updateConnectionStatus();
  setupInstall();
  renderPropertyList();
  renderArchiveList();
  setupCloud();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch((error) => {
        console.warn('Service worker registration failed:', error);
      });
    });
  }
}

init();
})();
