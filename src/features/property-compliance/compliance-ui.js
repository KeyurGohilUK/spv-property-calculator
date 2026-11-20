import '../../components/file-upload-field.js';
import { uploadPropertyEvidence, downloadPropertyEvidence, deletePropertyEvidence } from './evidence-service.js';
import { getProperty, saveProperty } from '../properties/storage.js';
import { buildPropertyCompliance } from './compliance-rules.js';
import { escapeHtml } from '../../utils/format-utils.js';

const $ = (id) => document.getElementById(id);
let propertyId = null;
let currentTab = 'overview';
let pendingEvidenceAction = false;
async function canEdit() {
  const access = await window.SPVCloud?.getWorkspaceAccess?.().catch(() => null);
  return Boolean(access?.active && access.role !== 'viewer');
}
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
    const evidence = Array.isArray(record.evidence) ? record.evidence : [];
    const completed = item.status === 'compliant' || item.status === 'not-applicable';
    return `<details class="property-compliance-item" data-status="${item.status}">
      <summary><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.reason)}</small></span><span class="property-compliance-state">${labels[item.status]}</span></summary>
      <form data-compliance-requirement="${escapeHtml(item.id)}">
        <label class="field">Issue / inspection date <input name="issuedOn" type="date" value="${escapeHtml(record.issuedOn || '')}"></label>
        <label class="field">Next due / expiry date <input name="expiryDate" type="date" value="${escapeHtml(record.expiryDate || '')}"></label>
        <label class="property-compliance-check"><input name="confirmed" type="checkbox" ${record.confirmed === true ? 'checked' : ''}> Record verified (after checking supporting documents)</label>
        <label class="property-compliance-check"><input name="remedialActionOpen" type="checkbox" ${record.remedialActionOpen === true ? 'checked' : ''}> Remedial work outstanding</label>
        <label class="property-compliance-check"><input name="seriousHazard" type="checkbox" ${record.seriousHazard === true ? 'checked' : ''}> Serious unresolved hazard</label>
        <section class="property-compliance-evidence" aria-label="Supporting evidence">
          <strong>Certificate documents · ${evidence.length}</strong>
          <ul>${evidence.map(file => `<li><span>${escapeHtml(file.name || 'Certificate')} · ${escapeHtml((file.uploadedAt || '').slice(0,10))}</span>
            <button type="button" class="secondary-btn" data-property-evidence-download="${escapeHtml(file.id)}" data-requirement="${escapeHtml(item.id)}">Download</button>
            <button type="button" class="secondary-btn" data-property-evidence-delete="${escapeHtml(file.id)}" data-requirement="${escapeHtml(item.id)}">Remove</button></li>`).join('')}</ul>
          <file-upload-field input-id="evidence-${escapeHtml(item.id)}" label="Attach certificate" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" help="PDF or image · maximum 5 MB"></file-upload-field>
          <button type="button" class="secondary-btn" data-property-evidence-upload="${escapeHtml(item.id)}">Upload document</button>
          <small>Documents require online access to private storage. Previous documents remain available until removed.</small>
        </section>
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
  const download = event.target.closest('[data-property-evidence-download]');
  const remove = event.target.closest('[data-property-evidence-delete]');
  const upload = event.target.closest('[data-property-evidence-upload]');
  if (download || remove || upload) { void evidenceAction({download,remove,upload}); return; }
  const tab = event.target.closest('[data-compliance-tab]');
  if (tab) { currentTab = tab.dataset.complianceTab; render(); }
});
async function evidenceAction({download,remove,upload}) {
  if (pendingEvidenceAction || !propertyId) return;
  const property = getProperty(propertyId);
  if (!property) return;
  const key = upload?.dataset.propertyEvidenceUpload || (download || remove).dataset.requirement;
  const record = property.complianceRecords?.[key] || {};
  const history = Array.isArray(record.evidence) ? record.evidence : [];
  const file = history.find(x => x.id === (download || remove)?.dataset.propertyEvidenceDownload)
    || history.find(x => x.id === remove?.dataset.propertyEvidenceDelete);
  if ((upload || remove) && !(await canEdit())) {
    $('propertyComplianceMessage').textContent = 'Editor access is required to change evidence.';
    return;
  }
  pendingEvidenceAction = true;
  try {
    if (download) {
      if (!file) throw new Error('Certificate not found.');
      await downloadPropertyEvidence(propertyId, file);
    } else if (upload) {
      const input = document.getElementById('evidence-' + key);
      const selected = input?.files?.[0];
      if (!selected) throw new Error('Choose a certificate first.');
      const stored = await uploadPropertyEvidence(propertyId, selected);
      try {
        const latest = getProperty(propertyId);
        const previous = latest.complianceRecords || {};
        const current = previous[key] || {};
        saveProperty({...latest, complianceRecords: {...previous, [key]: {...current, evidence: [...(current.evidence || []),stored]}}});
      } catch (error) {
        await deletePropertyEvidence(propertyId, stored).catch(() => {});
        throw error;
      }
      render();
      window.dispatchEvent(new Event('spv-properties-updated'));
      $('propertyComplianceMessage').textContent = 'Certificate uploaded and linked to this property.';
    } else if (remove) {
      if (!file) throw new Error('Certificate not found.');
      if (!window.confirm('Permanently remove this certificate document?')) return;
      // Preserve the R2 object if saving metadata fails, so the reference remains usable.
      const latest = getProperty(propertyId);
      const previous = latest.complianceRecords || {};
      const current = previous[key] || {};
      saveProperty({...latest, complianceRecords: {...previous, [key]: {...current, evidence: history.filter(x=>x.id!==file.id)}}});
      await deletePropertyEvidence(propertyId,file).catch(error => {
        saveProperty({...getProperty(propertyId),complianceRecords:{...getProperty(propertyId).complianceRecords,[key]:current}});
        throw error;
      });
      render();
      window.dispatchEvent(new Event('spv-properties-updated'));
      $('propertyComplianceMessage').textContent = 'Certificate removed.';
    }
  } catch (error) {
    $('propertyComplianceMessage').textContent = error.message || 'Could not complete evidence action.';
  } finally { pendingEvidenceAction = false; }
}
document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-compliance-requirement]');
  if (!form) return;
  event.preventDefault();
  const property = getProperty(propertyId);
  if (!property) return;
  if (!(await canEdit())) {
    $('propertyComplianceMessage').textContent = 'Editor access is required to save compliance records.';
    return;
  }
  const id = form.dataset.complianceRequirement;
  const data = new FormData(form);
  const existing = property.complianceRecords || {};
  try {
    saveProperty({...property, complianceRecords: {...existing, [id]: {
      ...existing[id],
      issuedOn: String(data.get('issuedOn') || ''),
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
