import { setupDialog } from '../../components/dialog-helper.js';
import { escapeHtml } from '../../utils/format-utils.js';
import {
  listStoredCompanyProfiles, newCompanyId, setActiveCompanyId, saveCompanyProfile
} from './company-storage.js';
import { syncCompanyProfile } from './company-cloud-sync.js';

const $ = (id) => document.getElementById(id);
let editingAllowed = false;
const addDialog = setupDialog($('addCompanyDialog'), {
  closeButtons: [$('closeAddCompanyDialog'), $('cancelAddCompany')]
});

function renderCompanies() {
  const records = listStoredCompanyProfiles().sort((a, b) => a.companyName.localeCompare(b.companyName));
  $('companyCards').innerHTML = records.map((company) => `
    <a class="company-list-card" href="./company/details.html?company=${encodeURIComponent(company.id)}">
      <span class="company-list-card-icon" aria-hidden="true">⌂</span>
      <strong>${escapeHtml(company.companyName)}</strong>
      <small>${escapeHtml(company.companyNumber || 'Company number not recorded')}</small>
      <span class="company-list-card-status">${escapeHtml(company.companyStatus ? company.companyStatus.charAt(0).toUpperCase() + company.companyStatus.slice(1) : 'Details needed')}</span>
      <span class="company-list-card-open">Open company →</span>
    </a>`).join('') + `
    <button id="addCompanyCard" class="company-list-card company-list-add" type="button" ${editingAllowed ? '' : 'disabled'}>
      <span class="company-list-plus" aria-hidden="true">+</span>
      <strong>Add new company</strong>
      <small>Create a separate company record</small>
    </button>`;
  $('companyListMessage').textContent = records.length
    ? `${records.length} compan${records.length === 1 ? 'y' : 'ies'} in this workspace`
    : 'No company records yet. Add your first company.';
}

$('companyCards').addEventListener('click', (event) => {
  const add = event.target.closest('#addCompanyCard');
  if (!add || !editingAllowed) return;
  $('newCompanyName').value = '';
  $('addCompanyMessage').textContent = '';
  addDialog.open(add);
});

$('addCompanyForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editingAllowed) return;
  const name = $('newCompanyName').value.trim();
  if (!name) { $('addCompanyMessage').textContent = 'Enter a company name.'; return; }
  const id = newCompanyId();
  const existing = listStoredCompanyProfiles();
  if (existing.some((item) => item.companyName.toLowerCase() === name.toLowerCase())) {
    $('addCompanyMessage').textContent = 'A company with that name is already recorded.';
    return;
  }
  try {
    setActiveCompanyId(id);
    saveCompanyProfile({ companyName: name });
    addDialog.close();
    window.location.assign(new URL(`./company/details.html?company=${encodeURIComponent(id)}`, document.baseURI).href);
  } catch (error) {
    $('addCompanyMessage').textContent = error.message || 'Company could not be created.';
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
