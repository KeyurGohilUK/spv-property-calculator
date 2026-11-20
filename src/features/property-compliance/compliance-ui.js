import { getProperty, saveProperty } from '../properties/storage.js';
import { buildPropertyCompliance } from './compliance-rules.js';
import { escapeHtml } from '../../utils/format-utils.js';

const $ = (id) => document.getElementById(id);
let propertyId = null;
let currentTab = 'overview';
const labels = {'critical':'Critical','overdue':'Overdue','action-required':'Action required','verification-required':'Verify','due-soon':'Due soon','compliant':'Recorded compliant','not-applicable':'Not applicable'};
const dateToday = () => new Date().toISOString().slice(0, 10);
function render() {
  const property = getProperty(propertyId);
  if (!property || property.deletedAt) { close(); return; }
  $('propertyComplianceName').textContent = property.title || 'Untitled property';
  const records = property.complianceRecords || {};
  const { items, counts } = buildPropertyCompliance({ property: property.complianceSettings || {}, records, today: dateToday(), group: currentTab });
  $('propertyComplianceSummary').textContent = [
    counts.overdue + ' critical / overdue', counts.actionRequired + ' need review',
    counts.dueSoon + ' due soon', counts.compliant + ' recorded compliant'
  ].join(' · ');
  $('propertyComplianceItems').innerHTML = items.map(item => {
    const record = records[item.id] || {};
    const completed = item.status === 'compliant' || item.status === 'not-applicable';
    return `<details class="property-compliance-item" data-status="${item.status}">
      <summary><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.reason)}</small></span><span class="property-compliance-state">${labels[item.status]}</span></summary>
      <form data-compliance-requirement="${escapeHtml(item.id)}">
        <label class="field">Next due / expiry date <input name="expiryDate" type="date" value="${escapeHtml(record.expiryDate || '')}"></label>
        <label class="property-compliance-check"><input name="confirmed" type="checkbox" ${record.confirmed === true ? 'checked' : ''}> Record verified (after checking supporting documents)</label>
        <label class="property-compliance-check"><input name="remedialActionOpen" type="checkbox" ${record.remedialActionOpen === true ? 'checked' : ''}> Remedial work outstanding</label>
        <label class="property-compliance-check"><input name="seriousHazard" type="checkbox" ${record.seriousHazard === true ? 'checked' : ''}> Serious unresolved hazard</label>
        <button type="submit" class="primary-btn">Save record</button>
        <small>${completed ? 'Recorded details are current in this workspace.' : 'Do not mark verified without checking applicable obligations and documents.'}</small>
      </form>
    </details>`;
  }).join('');
  document.querySelectorAll('[data-compliance-tab]').forEach(button => {
    const selected = button.dataset.complianceTab === currentTab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
}
function open(id) {
  if (!getProperty(id)) return;
  propertyId = id; currentTab = 'overview';
  $('portfolioView').hidden = true;
  $('propertyComplianceView').hidden = false;
  render();
  $('propertyComplianceTitle').focus?.();
  window.scrollTo({top:0,behavior:'instant'});
}
function close() {
  propertyId = null;
  $('propertyComplianceView').hidden = true;
  $('portfolioView').hidden = false;
  document.querySelector('#portfolioTab')?.focus();
}
document.addEventListener('click', (event) => {
  const launch = event.target.closest('[data-open-property-compliance]');
  if (launch) { open(launch.dataset.openPropertyCompliance); return; }
  if (event.target.closest('#propertyComplianceBack')) { close(); return; }
  const tab = event.target.closest('[data-compliance-tab]');
  if (tab) { currentTab = tab.dataset.complianceTab; render(); }
});
document.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-compliance-requirement]');
  if (!form) return;
  event.preventDefault();
  const property = getProperty(propertyId);
  if (!property) return;
  const id = form.dataset.complianceRequirement;
  const data = new FormData(form);
  const existing = property.complianceRecords || {};
  try {
    saveProperty({...property, complianceRecords: {...existing, [id]: {
      expiryDate: String(data.get('expiryDate') || ''),
      confirmed: data.has('confirmed'),
      remedialActionOpen: data.has('remedialActionOpen'),
      seriousHazard: data.has('seriousHazard')
    }}});
    $('propertyComplianceMessage').textContent = 'Compliance record saved on this device. Sync it with your workspace when online.';
    render();
    window.dispatchEvent(new Event('spv-properties-updated'));
  } catch {
    $('propertyComplianceMessage').textContent = 'Could not save. Check available device storage and try again.';
  }
});
