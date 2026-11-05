import { setupDialog } from '../../components/dialog-helper.js';
import { escapeHtml } from '../../utils/format-utils.js';
import { getActiveProperties } from '../properties/storage.js';
import {
  listStoredCompanyProfiles, newCompanyId, setActiveCompanyId, saveCompanyProfile
} from './company-storage.js';
import { syncCompanyProfile } from './company-cloud-sync.js';

const $ = (id) => document.getElementById(id);
let editingAllowed = false;
let companySearchSequence = 0;
const displayCompanyStatus = (status) => status ? String(status).charAt(0).toUpperCase() + String(status).slice(1) : '';
const addDialog = setupDialog($('addCompanyDialog'), {
  closeButtons: [$('closeAddCompanyDialog'), $('cancelAddCompany')]
});

function renderCompanies() {
  const records = listStoredCompanyProfiles().sort((a, b) => a.companyName.localeCompare(b.companyName));
  $('newCompanyBtn').disabled = !editingAllowed;
  const properties = getActiveProperties();
  $('companyCards').innerHTML = records.map((company) => {
    const propertyCount = properties.filter((property) => property.purchasingCompanyId === company.id).length;
    const status = displayCompanyStatus(company.companyStatus) || 'Details needed';
    const isActive = status.toLowerCase() === 'active';
    const incorporationDate = company.incorporationDate
      ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${company.incorporationDate}T00:00:00Z`))
      : 'Not recorded';
    return `
      <a class="company-list-card" href="./company/details.html?company=${encodeURIComponent(company.id)}">
        <span class="company-list-card-icon" aria-hidden="true">⌂</span>
        <span class="company-list-card-content">
          <span class="company-list-card-heading">
            <strong>${escapeHtml(company.companyName)}</strong>
            <span class="company-list-card-status${isActive ? ' is-active' : ''}"><span aria-hidden="true"></span>${escapeHtml(status)}</span>
          </span>
          <span class="company-list-card-details">
            <span>CRN: <strong>${escapeHtml(company.companyNumber || 'Not recorded')}</strong></span>
            <span>Incorp: <strong>${escapeHtml(incorporationDate)}</strong></span>
          </span>
          <span class="company-list-card-meta">
            <span class="company-list-card-property-count"><span aria-hidden="true">⌂</span> ${propertyCount} ${propertyCount === 1 ? 'Property' : 'Properties'}</span>
          </span>
        </span>
        <span class="company-list-card-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></span>
      </a>`;
  }).join('');
  $('companyListMessage').textContent = records.length
    ? `${records.length} compan${records.length === 1 ? 'y' : 'ies'} in this workspace`
    : 'No company records yet. Add your first company.';
}

$('newCompanyBtn').addEventListener('click', (event) => {
  const add = event.currentTarget;
  if (!editingAllowed) return;
  companySearchSequence++;
  $('addCompanyForm').reset();
  $('newCompanySearchResults').replaceChildren();
  searchCompanyStatus('');
  $('newCompanySearchBtn').disabled = false;
  addCompanyError('');
  addDialog.open(add);
});


function searchCompanyStatus(message, kind = 'info') {
  const status = $('newCompanySearchStatus');
  status.textContent = message;
  status.classList.toggle('is-error', Boolean(message) && kind === 'error');
  status.classList.toggle('is-success', Boolean(message) && kind === 'success');
  status.setAttribute('role', kind === 'error' ? 'alert' : 'status');
}

function addCompanyError(message) {
  const status = $('addCompanyMessage');
  status.textContent = message;
  status.classList.toggle('is-error', Boolean(message));
  status.setAttribute('role', message ? 'alert' : 'status');
}

async function searchNewCompany() {
  if (!editingAllowed) return;
  const query = $('newCompanySearchInput').value.trim();
  const requestId = ++companySearchSequence;
  $('newCompanySearchResults').replaceChildren();
  if (query.length < 2) {
    searchCompanyStatus('Enter at least two characters to search.', 'error');
    return;
  }
  if (!navigator.onLine || !window.SPVCloud?.searchCompaniesHouse) {
    searchCompanyStatus('Company search requires an internet connection and sign-in.', 'error');
    return;
  }
  $('newCompanySearchBtn').disabled = true;
  searchCompanyStatus('Searching Companies House…');
  try {
    const matches = await window.SPVCloud.searchCompaniesHouse(query);
    if (requestId !== companySearchSequence || !addDialog.dialog.open) return;
    searchCompanyStatus(matches.length ? `${matches.length} matching companies. Select the correct company.` : 'No matching companies found.', matches.length ? 'info' : 'error');
    $('newCompanySearchResults').innerHTML = matches.map((item) => `<div class="company-search-result">
      <span><strong>${escapeHtml(item.companyName)}</strong><small>${escapeHtml(item.companyNumber)} · ${escapeHtml(displayCompanyStatus(item.companyStatus) || 'Status unknown')}${item.registeredOffice ? ' · ' + escapeHtml(item.registeredOffice) : ''}</small></span>
      <button type="button" class="secondary-btn" data-company-lookup="${escapeHtml(item.companyNumber)}" aria-label="Select ${escapeHtml(item.companyName)}">Select</button>
    </div>`).join('');
  } catch (error) {
    if (requestId === companySearchSequence) searchCompanyStatus(error.message || 'Company search failed.', 'error');
  } finally {
    if (requestId === companySearchSequence) $('newCompanySearchBtn').disabled = !editingAllowed;
  }
}

async function selectNewCompany(companyNumber) {
  if (!editingAllowed || !/^[A-Z0-9]{2}[0-9]{6}$/.test(companyNumber)) return;
  if (listStoredCompanyProfiles().some((item) => String(item.companyNumber || '').trim().toUpperCase() === companyNumber)) {
    searchCompanyStatus('This registered company already has a card. Open the existing company instead.', 'error');
    return;
  }
  if (!navigator.onLine || !window.SPVCloud?.getCompanyHouseDeadlines) {
    searchCompanyStatus('Retrieving company details requires an internet connection and sign-in.', 'error');
    return;
  }
  const requestId = ++companySearchSequence;
  $('newCompanySearchBtn').disabled = true;
  searchCompanyStatus('Retrieving official company particulars…');
  try {
    const official = await window.SPVCloud.getCompanyHouseDeadlines(companyNumber);
    if (requestId !== companySearchSequence || !addDialog.dialog.open) return;
    if (String(official.companyNumber).toUpperCase() !== companyNumber) throw new Error('Unexpected company number returned.');
    $('newCompanyName').value = official.companyName || '';
    $('newCompanyNumber').value = official.companyNumber;
    $('newCompanyOffice').value = official.registeredOffice || '';
    $('newCompanyStatus').value = displayCompanyStatus(official.companyStatus);
    $('newCompanyDate').value = official.incorporationDate || '';
    searchCompanyStatus('Official details populated. Review and press Add company.', 'success');
    $('newCompanySearchResults').replaceChildren();
  } catch (error) {
    if (requestId === companySearchSequence) searchCompanyStatus(error.message || 'Company lookup failed.', 'error');
  } finally {
    if (requestId === companySearchSequence) $('newCompanySearchBtn').disabled = !editingAllowed;
  }
}

$('newCompanySearchBtn').addEventListener('click', searchNewCompany);
$('newCompanySearchInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); searchNewCompany(); }
});
$('newCompanySearchResults').addEventListener('click', (event) => {
  const button = event.target.closest('[data-company-lookup]');
  if (button) selectNewCompany(button.dataset.companyLookup);
});

$('addCompanyForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editingAllowed) return;
  const name = $('newCompanyName').value.trim();
  if (!name) { addCompanyError('Enter a company name.'); return; }
  const number = $('newCompanyNumber').value.trim().toUpperCase();
  const existing = listStoredCompanyProfiles();
  if (number && existing.some((item) => String(item.companyNumber || '').trim().toUpperCase() === number)) {
    addCompanyError('This company number is already recorded in another company card.');
    return;
  }
  const id = newCompanyId();
  if (existing.some((item) => item.companyName.toLowerCase() === name.toLowerCase())) {
    addCompanyError('A company with that name is already recorded.');
    return;
  }
  try {
    setActiveCompanyId(id);
    saveCompanyProfile({ companyName: name, companyNumber: number, registeredOffice: $('newCompanyOffice').value, companyStatus: $('newCompanyStatus').value, incorporationDate: $('newCompanyDate').value });
    addDialog.close();
    window.location.assign(new URL(`./company/details.html?company=${encodeURIComponent(id)}`, document.baseURI).href);
  } catch (error) {
    addCompanyError(error.message || 'Company could not be created.');
  }
});

window.addEventListener('spv-workspace-synced', renderCompanies);

async function initialiseCompanyList() {
  renderCompanies();
  try {
    const session = await window.SPVCloud?.init?.();
    if (!session?.user) return;
    const access = await window.SPVCloud.getWorkspaceAccess();
    editingAllowed = Boolean(access?.active && access.role !== 'viewer');
    if (!access?.active) {
      $('companyListSyncStatus').textContent = 'Workspace access unavailable';
      renderCompanies();
      return;
    }
    await syncCompanyProfile(window.SPVCloud);
    $('companyListSyncStatus').textContent = 'Company records synced';
  } catch (error) {
    $('companyListSyncStatus').textContent = 'Sync pending · local records retained';
    console.warn('Company list sync pending:', error);
  }
  renderCompanies();
}
initialiseCompanyList();
