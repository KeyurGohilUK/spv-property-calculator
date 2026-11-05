import '../../components/file-upload-field.js';
import { setupDialog } from '../../components/dialog-helper.js';
import { buildCompanyCompliance, formatComplianceDateUK, hmrcDeadlines, hmrcTaxPeriods, addMonthsClamped } from './compliance-rules.js';
import { escapeHtml, formatDate } from '../../utils/format-utils.js';
import { syncCompanyProfile } from './company-cloud-sync.js';
import { normalizeHmrcTracking, hmrcPeriodSummary, saveHmrcSetup, saveHmrcPeriodRecord, recordHmrcPayment, updateHmrcPayment, removeHmrcPayment, removeHmrcPeriod } from './hmrc-tracking.js';
import { hmrcOverviewState } from './hmrc-guided.js';
import { uploadComplianceEvidence, viewComplianceEvidence, downloadComplianceEvidence, deleteComplianceEvidence, validateEvidenceFile } from '../../services/compliance-evidence.js';
import {
  getCompanyProfile,
  setActiveCompanyId,
  listStoredCompanyProfiles,
  deleteCompanyProfile,
  saveCompanyProfile,
  addCompanyEvidence,
  removeCompanyEvidence,
  saveComplianceConfirmation,
  saveAppointment,
  deleteAppointment,
  saveInvestment,
  deleteInvestment,
  getInvestmentSummary,
  INVESTMENT_MEMBER_ROLES
} from './company-storage.js';

const $ = (id) => document.getElementById(id);
const CURRENCY_FORMAT = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const displayCompanyStatus = (status) => status ? String(status).charAt(0).toUpperCase() + String(status).slice(1) : '';
const EDIT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>';
const PLUS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14"/><path d="M5 12h14"/></svg>';
const ATTACHMENT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg>';
const DOWNLOAD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>';
const VIEW_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
const REMOVE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
function evidenceActionMarkup(file, allowRemove) {
  const id = escapeHtml(file.id);
  const label = escapeHtml(file.name);
  return `<button type="button" class="icon-btn company-evidence-action" data-evidence-download="${id}" aria-label="Download ${label}" title="Download ${label}">${DOWNLOAD_ICON}</button>
    ${allowRemove ? `<button type="button" class="icon-btn company-evidence-action company-evidence-action--remove" data-evidence-remove="${id}" aria-label="Remove ${label}" title="Remove ${label}">${REMOVE_ICON}</button>` : ''}`;
}
const ROLE_LABELS = Object.freeze({
  director: 'Director', shareholder: 'Shareholder', secretary: 'Secretary', psc: 'PSC'
});
const currentCompanyId = new URLSearchParams(window.location.search).get('company');
if (!currentCompanyId) {
  window.location.replace(new URL('./company/', document.baseURI).href);
} else {
  try { setActiveCompanyId(currentCompanyId); }
  catch { window.location.replace(new URL('./company/', document.baseURI).href); }
}
let profile = getCompanyProfile();
let editingAllowed = true;
let deleteAllowed = false;
let companyHouseData = null;
let companyHouseError = '';
let lookupCompanyNumber = '';
let companySearchSequence = 0;

const detailsDialog = setupDialog($('companyDetailsDialog'), {
  closeButtons: [$('closeCompanyDetailsDialog'), $('cancelCompanyDetailsBtn')]
});
const appointmentDialog = setupDialog($('appointmentDialog'), {
  closeButtons: [$('closeAppointmentDialog'), $('cancelAppointmentBtn')]
});
const investmentDialog = setupDialog($('investmentDialog'), {
  closeButtons: [$('closeInvestmentDialog'), $('cancelInvestmentBtn')]
});

const deleteCompanyDialog = setupDialog($('deleteCompanyDialog'), {
  closeButtons: [$('closeDeleteCompanyDialog'), $('cancelDeleteCompanyBtn')]
});

const companyTabs = [...document.querySelectorAll('[data-company-tab]')];

function activateCompanyTab(tab, focus = false) {
  companyTabs.forEach((item) => {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    const panel = document.getElementById(item.getAttribute('aria-controls'));
    if (panel) panel.hidden = !selected;
  });
  if (focus) tab.focus();
}

companyTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateCompanyTab(tab));
  tab.addEventListener('keydown', (event) => {
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % companyTabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + companyTabs.length) % companyTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = companyTabs.length - 1;
    else return;
    event.preventDefault();
    activateCompanyTab(companyTabs[nextIndex], true);
  });
});


const complianceAuthorityTabs = [...document.querySelectorAll('[data-compliance-authority]')];
function activateComplianceAuthority(tab, focus = false) {
  complianceAuthorityTabs.forEach((item) => {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    const panel = document.getElementById(item.getAttribute('aria-controls'));
    if (panel) panel.hidden = !selected;
    const action = document.getElementById(item.dataset.authorityActionId);
    if (action) action.textContent = selected ? 'Viewing this authority' : 'Switch to view';
  });
  if (focus) tab.focus();
}
complianceAuthorityTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateComplianceAuthority(tab));
  tab.addEventListener('keydown', (event) => {
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % complianceAuthorityTabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + complianceAuthorityTabs.length) % complianceAuthorityTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = complianceAuthorityTabs.length - 1;
    else return;
    event.preventDefault();
    activateComplianceAuthority(complianceAuthorityTabs[nextIndex], true);
  });
});
if (complianceAuthorityTabs.length) activateComplianceAuthority(complianceAuthorityTabs[0]);



function roleMark(appointment, role) {
  return appointment.roles.includes(role)
    ? '<span class="company-role-mark" role="img" aria-label="Yes">✓</span>'
    : '<span class="company-role-none" role="img" aria-label="No">—</span>';
}

function setSyncStatus(message, state = '') {
  const status = $('companySyncStatus');
  status.textContent = message;
  status.classList.toggle('error', state === 'error');
  status.classList.toggle('synced', state === 'synced');
}

function normalizeCompaniesHousePersonName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

function appointmentIdentityCheck(appointment) {
  const people = companyHouseData?.officialPeople;
  const roleDefinitions = [
    {
      role: 'director',
      label: 'Director',
      available: people?.officersAvailable,
      records: (people?.officers || []).filter((entry) => entry.role === 'director')
    },
    {
      role: 'psc',
      label: 'PSC',
      available: people?.pscsAvailable,
      records: people?.pscs || []
    }
  ].filter((definition) => appointment.roles.includes(definition.role));

  if (!roleDefinitions.length) {
    return { state: 'not-applicable', label: 'Not applicable', detail: 'No director or PSC role listed.', verifiedCount: 0, totalCount: 0 };
  }
  if (!people) {
    return {
      state: 'unknown',
      label: 'Not checked',
      detail: companyHouseError || (profile.companyNumber ? 'Waiting for Companies House records.' : 'Add a company number to check Companies House.'),
      verifiedCount: 0,
      totalCount: roleDefinitions.length
    };
  }

  const personName = normalizeCompaniesHousePersonName(appointment.name);
  const results = roleDefinitions.map((definition) => {
    if (!definition.available) return { ...definition, state: 'unavailable', detail: 'Records unavailable' };
    const matches = definition.records.filter((entry) => normalizeCompaniesHousePersonName(entry.name) === personName);
    if (matches.length > 1) return { ...definition, state: 'ambiguous', detail: 'More than one public record matches this name' };
    if (!matches.length) return { ...definition, state: 'not-found', detail: 'No matching public record' };
    const entry = matches[0];
    const statementDate = entry.verification?.statementStartOn;
    const verifiedDate = entry.verification?.verifiedOn;
    if (!statementDate && !verifiedDate) {
      return { ...definition, state: 'unverified', detail: 'Verification evidence not published' };
    }
    const evidenceDate = statementDate || verifiedDate;
    return {
      ...definition,
      state: 'verified',
      detail: statementDate
        ? `statement recorded${evidenceDate ? ` ${formatComplianceDateUK(evidenceDate)}` : ''}`
        : `identity verified${evidenceDate ? ` ${formatComplianceDateUK(evidenceDate)}` : ''}`
    };
  });

  const verifiedCount = results.filter((result) => result.state === 'verified').length;
  const detail = results.map((result) => `${result.label}: ${result.detail}`).join(' · ');
  if (verifiedCount === results.length) {
    return { state: 'verified', label: 'Verified', detail, verifiedCount, totalCount: results.length };
  }
  if (results.some((result) => result.state === 'unavailable')) {
    return { state: 'unknown', label: 'Unavailable', detail, verifiedCount, totalCount: results.length };
  }
  if (verifiedCount > 0) {
    return { state: 'attention', label: 'Review', detail, verifiedCount, totalCount: results.length };
  }
  return { state: 'attention', label: 'Not confirmed', detail, verifiedCount, totalCount: results.length };
}

function identityCheckBadgeMarkup(check) {
  const tone = check.state === 'verified'
    ? 'company-identity-chip--recorded'
    : check.state === 'attention'
      ? 'company-identity-chip--attention'
      : 'company-identity-chip--neutral';
  return `<span class="company-identity-chip ${tone}">${escapeHtml(check.label)}</span>`;
}

function renderAppointments() {
  const empty = profile.appointments.length === 0;
  $('companyAppointmentsEmpty').classList.toggle('hidden', !empty);
  $('companyAppointmentsTable').classList.toggle('hidden', empty);
  $('companyAppointmentCards').classList.toggle('hidden', empty);

  const checks = profile.appointments.map((appointment) => appointmentIdentityCheck(appointment));
  const applicableChecks = checks.filter((check) => check.totalCount > 0);
  const totalRoles = applicableChecks.reduce((total, check) => total + check.totalCount, 0);
  const verifiedRoles = applicableChecks.reduce((total, check) => total + check.verifiedCount, 0);
  const recordsAvailable = applicableChecks.every((check) => check.state !== 'unknown');
  $('companyIdentitySummary').innerHTML = !totalRoles
    ? '<span class="company-identity-chip company-identity-chip--neutral">No checks listed</span><span>Add director or PSC roles to compare them with Companies House.</span>'
    : !recordsAvailable
      ? '<span class="company-identity-chip company-identity-chip--neutral">Companies House unavailable</span><span>Identity status will appear when the official people records are retrieved.</span>'
      : `<span class="company-identity-chip ${verifiedRoles === totalRoles ? 'company-identity-chip--recorded' : 'company-identity-chip--neutral'}">${verifiedRoles} of ${totalRoles} roles verified</span><span>Based on identity verification evidence returned by Companies House for the listed appointments.</span>`;

  $('companyAppointmentsRows').innerHTML = profile.appointments.map((appointment) => {
    const roles = appointment.roles.map((role) => ROLE_LABELS[role]).filter(Boolean);
    const check = appointmentIdentityCheck(appointment);
    return `
      <tr>
        <th scope="row"><div class="company-appointment-person"><div class="company-appointment-person-copy"><span class="company-appointment-name">${escapeHtml(appointment.name)} <small class="company-appointment-role-list">(${escapeHtml(roles.join(', ') || 'No roles selected')})</small></span><small class="company-identity-detail">${escapeHtml(check.detail)}</small></div>${identityCheckBadgeMarkup(check)}</div></th>
        <td class="company-appointment-action-cell"><button class="secondary-btn compact-company-btn company-edit-icon-btn" type="button" aria-label="Edit appointment for ${escapeHtml(appointment.name)}" title="Edit appointment for ${escapeHtml(appointment.name)}" data-edit-appointment="${escapeHtml(appointment.id)}" ${editingAllowed ? '' : 'disabled'}>${EDIT_ICON}</button></td>
      </tr>`;
  }).join('');
  $('companyAppointmentCards').innerHTML = profile.appointments.map((appointment) => {
    const roles = appointment.roles.map((role) => ROLE_LABELS[role]).filter(Boolean);
    const check = appointmentIdentityCheck(appointment);
    return `
      <article class="company-appointment-card">
        <div class="company-appointment-person">
          <div class="company-appointment-person-copy">
            <span class="company-appointment-name">${escapeHtml(appointment.name)} <small class="company-appointment-role-list">(${escapeHtml(roles.join(', ') || 'No roles selected')})</small></span>
            <small class="company-identity-detail">${escapeHtml(check.detail)}</small>
          </div>
          <div class="company-appointment-actions">${identityCheckBadgeMarkup(check)}<button class="secondary-btn compact-company-btn company-edit-icon-btn" type="button" aria-label="Edit appointment for ${escapeHtml(appointment.name)}" title="Edit appointment for ${escapeHtml(appointment.name)}" data-edit-appointment="${escapeHtml(appointment.id)}" ${editingAllowed ? '' : 'disabled'}>${EDIT_ICON}</button></div>
        </div>
      </article>`;
  }).join('');
  document.querySelectorAll('[data-edit-appointment]').forEach((button) => {
    button.addEventListener('click', () => openAppointment(button.dataset.editAppointment));
  });
}

function eligibleInvestmentMembers() {
  return profile.appointments.filter((appointment) =>
    appointment.roles.some((role) => INVESTMENT_MEMBER_ROLES.includes(role))
  );
}

function memberName(memberId, fallback = '') {
  return profile.appointments.find((appointment) => appointment.id === memberId)?.name || fallback || 'Former member';
}

function investmentPieMarkup(members, total) {
  const center = 210;
  const radius = 180;
  let angle = -90;
  const slices = members.map((member, index) => {
    const amount = Number(member.amount) || 0;
    const sweep = total > 0 ? amount / total * 360 : 0;
    const endAngle = angle + sweep;
    const startRadians = angle * Math.PI / 180;
    const endRadians = endAngle * Math.PI / 180;
    const start = { x: center + radius * Math.cos(startRadians), y: center + radius * Math.sin(startRadians) };
    const end = { x: center + radius * Math.cos(endRadians), y: center + radius * Math.sin(endRadians) };
    const name = memberName(member.memberId, member.memberName);
    const percentage = member.contributionPercentage;
    const colorClass = `chart-color-${index % 6}`;
    const path = sweep >= 359.999
      ? `M ${center} ${center - radius} A ${radius} ${radius} 0 1 1 ${center} ${center + radius} A ${radius} ${radius} 0 1 1 ${center} ${center - radius} Z`
      : `M ${center} ${center} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${end.x} ${end.y} Z`;
    let label = '';
    if (percentage >= 8) {
      const midRadians = (angle + sweep / 2) * Math.PI / 180;
      const labelRadius = radius * (percentage < 18 ? 0.68 : 0.56);
      const x = center + labelRadius * Math.cos(midRadians);
      const y = center + labelRadius * Math.sin(midRadians);
      label = `<text class="company-investment-chart-slice-label" x="${x}" y="${y - 5}" text-anchor="middle"><tspan x="${x}">${escapeHtml(name)}</tspan><tspan x="${x}" dy="18">${percentage.toFixed(1)}%</tspan></text>`;
    }
    angle = endAngle;
    return `<path class="company-investment-chart-slice ${colorClass}" d="${path}" stroke="var(--surface)" stroke-width="3"><title>${escapeHtml(name)}: ${percentage.toFixed(2)}%</title></path>${label}`;
  });
  return `<svg class="company-investment-chart-pie" viewBox="0 0 420 420" role="img" aria-labelledby="companyInvestmentPieTitle companyInvestmentPieDescription"><title id="companyInvestmentPieTitle">Overall member investment split</title><desc id="companyInvestmentPieDescription">${members.map((member) => `${escapeHtml(memberName(member.memberId, member.memberName))}: ${member.contributionPercentage.toFixed(2)}%`).join('; ')}</desc>${slices.join('')}</svg>`;
}

function renderInvestments() {
  const investments = profile.investments || [];
  const empty = investments.length === 0;
  const members = eligibleInvestmentMembers();
  const summary = getInvestmentSummary(profile);
  $('companyInvestmentsEmpty').classList.toggle('hidden', summary.members.length > 0);
  $('companyInvestmentChart').classList.toggle('hidden', !summary.members.length);
  $('companyInvestmentSummaryWrap').classList.toggle('hidden', !summary.members.length);
  $('companyInvestmentsEntriesEmpty').classList.toggle('hidden', empty);
  $('companyInvestmentEntriesWrap').classList.toggle('hidden', empty);
  $('addInvestmentBtn').disabled = !editingAllowed || members.length === 0;
  $('addInvestmentBtn').title = members.length ? '' : 'Add a director or shareholder appointment first';
  $('companyInvestmentSummaryRows').innerHTML = summary.members.map((member) => `
    <tr>
      <th scope="row">${escapeHtml(memberName(member.memberId, member.memberName))}</th>
      <td>${CURRENCY_FORMAT.format(member.amount)}</td>
      <td>${member.contributionPercentage.toFixed(2)}%</td>
    </tr>`).join('');
  const chartMembers = [...summary.members].sort((a, b) => b.contributionPercentage - a.contributionPercentage);
  $('companyInvestmentChart').querySelector('.company-investment-chart-legend').innerHTML = chartMembers.map((member, index) => `
    <li><span class="company-investment-chart-key chart-color-${index % 6}" aria-hidden="true"></span><span>${escapeHtml(memberName(member.memberId, member.memberName))}: ${member.contributionPercentage.toFixed(1)}%</span></li>`).join('');
  $('companyInvestmentChart').querySelector('.company-investment-chart-plot').innerHTML = investmentPieMarkup(chartMembers, summary.total);
  $('companyInvestmentTotal').textContent = CURRENCY_FORMAT.format(summary.total);
  $('companyInvestmentEntryRows').innerHTML = [...investments].sort((a, b) =>
    String(b.date).localeCompare(String(a.date))
  ).map((investment) => `
    <tr>
      <td>${escapeHtml(investment.date ? formatDate(`${investment.date}T00:00:00`, { day: 'numeric', month: 'short', year: 'numeric' }, investment.date) : 'Date not recorded')}</td>
      <th scope="row">${escapeHtml(memberName(investment.memberId, investment.memberName))}</th>
      <td>${CURRENCY_FORMAT.format(investment.amount)}</td>
      <td class="company-investment-reference">${escapeHtml(investment.reference || '—')}</td>
      <td><button class="secondary-btn compact-company-btn company-edit-icon-btn" type="button" aria-label="Edit funding entry for ${escapeHtml(memberName(investment.memberId, investment.memberName))}" title="Edit funding entry" data-edit-investment="${escapeHtml(investment.id)}" ${editingAllowed ? '' : 'disabled'}>${EDIT_ICON}</button></td>
    </tr>`).join('');
  document.querySelectorAll('[data-edit-investment]').forEach((button) => {
    button.addEventListener('click', () => openInvestment(button.dataset.editInvestment));
  });
}

function currentDateInputValue() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

function openInvestment(id = '') {
  const investment = profile.investments.find((item) => item.id === id);
  const members = eligibleInvestmentMembers();
  const selectedMemberId = investment?.memberId || members[0]?.id || '';
  const selectedIsCurrent = members.some((item) => item.id === selectedMemberId);
  const options = members.map((member) => `<option value="${escapeHtml(member.id)}" ${member.id === selectedMemberId ? 'selected' : ''}>${escapeHtml(member.name)}</option>`);
  if (investment && !selectedIsCurrent) {
    options.unshift(`<option value="${escapeHtml(investment.memberId)}" selected>${escapeHtml(memberName(investment.memberId, investment.memberName))} (former member)</option>`);
  }
  $('investmentMemberInput').innerHTML = options.join('');
  $('investmentMemberInput').disabled = !members.length && !investment;
  $('investmentIdInput').value = investment?.id || '';
  $('investmentAmountInput').value = investment?.amount ?? '';
  $('investmentDateInput').value = investment?.date || currentDateInputValue();
  $('investmentReferenceInput').value = investment?.reference || '';
  $('investmentDialogTitle').textContent = investment ? 'Edit investment' : 'Add investment';
  $('deleteInvestmentBtn').classList.toggle('hidden', !investment);
  $('investmentMessage').textContent = '';
  const trigger = investment
    ? [...document.querySelectorAll('[data-edit-investment]')].find((button) => button.dataset.editInvestment === id)
    : $('addInvestmentBtn');
  investmentDialog.open(trigger || document.activeElement);
}

function renderCompanyCompliance() {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const items = buildCompanyCompliance({ today, company: companyHouseData || {}, confirmations: profile.complianceConfirmations, hmrc: profile.hmrc, enabledConditional: hmrcTaxPeriods(profile.hmrc).length ? ['corporation-tax-payment'] : [] });
  const evidenceFiles = profile.complianceEvidence || [];
  const evidenceBytes = evidenceFiles.reduce((sum, item) => sum + Number(item.size || 0), 0);
  $('companyEvidenceUsage').textContent = `${evidenceFiles.length} attached document${evidenceFiles.length === 1 ? '' : 's'} · ${(evidenceBytes / 1024 / 1024).toFixed(2)} MB (this company only)`;
  $('companyComplianceSummary').textContent = profile.companyNumber
    ? `${items.filter((item) => item.source !== 'companies-house' && item.status === 'user-confirmed').length} manually confirmed · ${companyHouseData ? 'Companies House deadlines retrieved' : companyHouseError || 'deadlines not yet retrieved'}`
    : 'Add a company number in Particulars to associate this checklist with your SPV.';
  $('hmrcTaxStatus').value = profile.hmrc?.status || 'unknown';
  const historyRoot = $('companyFilingHistory');
  if (historyRoot) {
    const records = Array.isArray(companyHouseData?.filingHistory) ? companyHouseData.filingHistory : [];
    historyRoot.innerHTML = !companyHouseData
      ? '<p class="muted">Filing history is unavailable while the Companies House lookup is offline.</p>'
      : !companyHouseData.filingHistoryAvailable
        ? '<p class="muted">Filing history could not be retrieved. Check the official register.</p>'
        : !records.length
          ? '<p class="muted">No accounts or confirmation statement filings found in the latest 100 public filing records.</p>'
          : `<ul class="company-filing-history-list">${records.map((record) => {
              const date = formatComplianceDateUK(record.date) || 'Date unavailable';
              const label = record.category === 'accounts' ? 'Annual accounts' : 'Confirmation statement / annual return';
              const filingUrl = `https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(profile.companyNumber)}/filing-history`;
              return `<li><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(date)} · ${escapeHtml(record.type)}</small></span><a href="${escapeHtml(filingUrl)}" target="_blank" rel="noopener noreferrer" aria-label="View ${escapeHtml(label)} filing on Companies House">View official record</a></li>`;
            }).join('')}</ul>`;
  }
  const renderCards = (selected) => selected.map((item) => {
    const statusLabel = item.status === 'user-confirmed' ? 'Confirmed'
      : item.status === 'due-soon' ? 'Due soon'
        : item.status === 'upcoming' ? 'Upcoming'
          : item.status === 'past-deadline-unverified' ? 'Past deadline · unverified'
            : 'Needs verification';
    const displayTitle = item.id === 'confirmation-statement' ? 'Confirmation Statement (CS01)' : item.id === 'annual-accounts' ? 'Annual Company Accounts' : item.id === 'statutory-registers' ? 'Company Statutory Records' : item.id === 'accounting-records' ? 'Accounting Records Preservation' : item.title;
    const due = item.dueDate ? escapeHtml(formatComplianceDateUK(item.dueDate)) : '';
    const nextStatementDate = companyHouseData?.confirmation_statement?.next_made_up_to
      ? escapeHtml(formatComplianceDateUK(companyHouseData.confirmation_statement.next_made_up_to)) : '';
    const summary = item.id === 'confirmation-statement'
      ? `Next statement date: <strong>${nextStatementDate || 'Not available'}</strong> · Due by <strong>${due || 'Not available'}</strong>`
      : item.id === 'annual-accounts'
        ? `Micro-entity or small company balance sheet · Due by <strong>${due || 'Not available'}</strong>`
        : item.id === 'statutory-registers'
          ? 'Register of Directors, Shareholders, and PSC registers must be maintained at registered office.'
          : item.id === 'accounting-records'
            ? 'Statutory 6-year retention compliance for invoices, receipts, and property tenancy records.'
            : item.dueDate
              ? `Due by <strong>${due}</strong> · ${item.source === 'companies-house' ? 'Companies House' : 'HMRC estimate'}`
              : 'Review this company obligation and keep appropriate records.';
    const icon = item.status === 'needs-verification' || item.status === 'past-deadline-unverified'
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 19a1.4 1.4 0 0 0 1.2 2.1h16a1.4 1.4 0 0 0 1.2-2.1L12 3Z"/><path d="M12 9v5m0 3h.01"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.75h8l4 4V20a1.25 1.25 0 0 1-1.25 1.25h-10.5A1.25 1.25 0 0 1 5 20V5a1.25 1.25 0 0 1 1-1.25Z"/><path d="M14 4v4h4M8 13h8m-8 4h8"/></svg>';
    return `
      <article class="company-compliance-item">
        <span class="company-compliance-item-icon ${item.status === 'needs-verification' || item.status === 'past-deadline-unverified' ? 'is-attention' : ''}" aria-hidden="true">${icon}</span>
        <div class="company-compliance-item-copy">
          <div class="company-compliance-item-heading"><strong>${escapeHtml(displayTitle)}</strong><span class="company-compliance-status ${item.status === 'needs-verification' || item.status === 'past-deadline-unverified' ? 'is-attention' : ''}">${statusLabel}</span></div>
          <p class="muted">${summary}</p>
        </div>
        <button type="button" class="secondary-btn company-compliance-open" data-open-company-compliance="${escapeHtml(item.key)}">${item.source === 'companies-house' ? 'Review filing' : 'Update record'}</button>
      </article>`;
  }).join('');
  $('companyAuthorityNumber').textContent = profile.companyNumber || 'Not recorded';
  $('companyHouseAuthorityStatus').textContent = companyHouseData ? 'Connected'
    : companyHouseError === 'Checking Companies House…' ? 'Checking'
      : profile.companyNumber ? 'Manual tracking' : 'Company number needed';
  $('companyHouseAuthorityStatus').classList.toggle('company-identity-chip--recorded', Boolean(companyHouseData));
  $('companyHouseAuthorityStatus').classList.toggle('company-identity-chip--neutral', !companyHouseData);
  $('companyHouseAuthoritySummary').textContent = companyHouseData
    ? 'Official deadlines retrieved · ' + items.filter((item) => item.source === 'companies-house').length + ' register records'
    : profile.companyNumber ? companyHouseError || 'Connect to retrieve official deadlines'
      : 'Add a company number for official deadlines';
  $('companiesHouseComplianceItems').innerHTML = renderCards(items.filter((item) => item.source !== 'hmrc' && !['corporation-tax-registration', 'director-identity', 'psc-identity'].includes(item.id)));

}

let companyComplianceDialogTriggerKey = '';
let companyComplianceDialogOpenedByPointer = false;

function renderCompanyComplianceDialog(ruleKey, open = true) {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const item = buildCompanyCompliance({ today, company: companyHouseData || {}, confirmations: profile.complianceConfirmations, hmrc: profile.hmrc, enabledConditional: hmrcTaxPeriods(profile.hmrc).length ? ['corporation-tax-payment'] : [] }).find((entry) => entry.key === ruleKey);
  if (!item) return;
  const label = item.status === 'user-confirmed' ? 'Confirmed' : item.status === 'due-soon' ? 'Due soon' : item.status === 'upcoming' ? 'Upcoming' : item.status === 'past-deadline-unverified' ? 'Past deadline · unverified' : 'Needs verification';
  $('companyComplianceDialogTitle').textContent = item.title;
  $('companyComplianceDialogStatus').textContent = label;
  $('companyComplianceDialogStatus').className = 'company-compliance-dialog-status' + (item.status === 'needs-verification' || item.status === 'past-deadline-unverified' ? ' is-attention' : '');
  const details = [];
  if (item.taxPeriod) details.push('Tax period: ' + formatComplianceDateUK(item.taxPeriod.periodStart) + ' – ' + formatComplianceDateUK(item.taxPeriod.periodEnd));
  if (item.dueDate) details.push('Due ' + formatComplianceDateUK(item.dueDate) + ' · ' + (item.source === 'companies-house' ? 'Companies House' : 'HMRC estimate'));
  if (item.officialFiling?.lastPeriod) details.push('Last filed period: ' + formatComplianceDateUK(item.officialFiling.lastPeriod) + ' · Companies House');
  else if (item.source === 'companies-house') details.push('Last filing period not available');
  if (item.reminder) details.push('Filing reminder: ' + item.reminder.message + ' · ' + item.reminder.windowDays + '-day reminder window');
  details.push(item.source === 'companies-house' ? (companyHouseData ? 'Official public filing period and next deadline; upcoming filing is not marked complete.' : 'Official filing data unavailable; check Companies House.') : item.source === 'hmrc' ? 'This is a suggested deadline based on the HMRC period you entered; check your HMRC account or accountant.' : 'Confirm this requirement and keep appropriate evidence.');
  $('companyComplianceDialogDetails').innerHTML = details.map((line) => '<p>' + escapeHtml(line) + '</p>').join('');
  const files = (profile.complianceEvidence || []).filter((file) => file.ruleKey === item.key);
  $('companyComplianceDialogEvidenceFiles').innerHTML = files.map((file) => '<li><span><strong>' + escapeHtml(file.name) + '</strong><small>' + Math.ceil(file.size / 1024) + ' KB · ' + escapeHtml(formatComplianceDateUK(file.uploadedAt?.slice(0, 10) || '') || 'Date unknown') + '</small></span>' + evidenceActionMarkup(file, editingAllowed) + '</li>').join('');
  const upload = $('companyComplianceEvidenceUpload');
  const input = $('companyComplianceEvidenceInput');
  upload.hidden = !editingAllowed;
  input.dataset.evidenceUpload = item.key;
  input.disabled = !editingAllowed;
  const done = $('companyComplianceDialogDone');
  done.hidden = item.source === 'companies-house';
  done.disabled = !editingAllowed;
  done.dataset.complianceKey = item.source === 'companies-house' ? '' : item.key;
  done.textContent = item.status === 'user-confirmed' ? 'Undo confirmation' : 'Mark as done';
  $('companyComplianceDialogMessage').textContent = '';
  const dialog = $('companyComplianceDialog');
  if (open && !dialog.open) dialog.showModal();
}

let hmrcGuideSelected = 'utr';
let hmrcPaymentEditingId = '';
let hmrcPaymentIsNew = false;

const hmrcDialogs = {
  setup: setupDialog($('hmrcSetupDialog'), { closeButtons: [...$('hmrcSetupDialog').querySelectorAll('[data-hmrc-close]')] }),
  activity: setupDialog($('hmrcActivityDialog'), { closeButtons: [...$('hmrcActivityDialog').querySelectorAll('[data-hmrc-close]')] }),
  period: setupDialog($('hmrcPeriodDialog'), { closeButtons: [...$('hmrcPeriodDialog').querySelectorAll('[data-hmrc-close]')] }),
  filing: setupDialog($('hmrcFilingDialog'), { closeButtons: [...$('hmrcFilingDialog').querySelectorAll('[data-hmrc-close]')] }),
  payment: setupDialog($('hmrcPaymentDialog'), { closeButtons: [...$('hmrcPaymentDialog').querySelectorAll('[data-hmrc-close]')] }),
  evidence: setupDialog($('hmrcEvidenceDialog'), { closeButtons: [...$('hmrcEvidenceDialog').querySelectorAll('[data-hmrc-close]')] })
};

// HMRC cards are rebuilt when saved. The native dialog otherwise tries to return
// focus to a removed button, which can focus/outline the entire Compliance panel.
for (const controller of Object.values(hmrcDialogs)) {
  const originalOpen = controller.open;
  let returnSelector = '';
  controller.open = (trigger) => {
    if (trigger?.dataset?.hmrcOpen) {
      const kind = trigger.dataset.hmrcOpen;
      const period = trigger.dataset.hmrcPeriod;
      returnSelector = period
        ? `[data-hmrc-open="${kind}"][data-hmrc-period="${period}"]`
        : `[data-hmrc-open="${kind}"]`;
    } else if (trigger?.dataset?.hmrcPaymentEdit) {
      returnSelector = `[data-hmrc-payment-edit="${trigger.dataset.hmrcPaymentEdit}"]`;
    } else if (trigger?.dataset?.hmrcAttach) {
      returnSelector = `[data-hmrc-attach="${trigger.dataset.hmrcAttach}"]`;
    } else {
      returnSelector = trigger?.id ? `#${trigger.id}` : '';
    }
    originalOpen(trigger);
  };
  controller.dialog.addEventListener('close', () => {
    const selector = returnSelector;
    returnSelector = '';
    if (!selector) return;
    window.requestAnimationFrame(() => {
      const target = [...document.querySelectorAll(selector)].find((element) =>
        !element.hidden && !element.disabled && element.getClientRects().length);
      target?.focus({ preventScroll: true });
    });
  });
}

const hmrcBadge = (label, kind = 'neutral') =>
  `<span class="hmrc-pill hmrc-pill--${kind}">${escapeHtml(label)}</span>`;
const hmrcDate = (date) => date ? escapeHtml(formatComplianceDateUK(date)) : 'Not recorded';
const hmrcDisplayReference = (reference) => reference ? '••••••••••••' + escapeHtml(reference.slice(-5)) : 'Not recorded';

function hmrcEvidenceMarkup(ruleKey, label) {
  const files = (profile.complianceEvidence || []).filter((file) => file.ruleKey === ruleKey);
  return `<div class="hmrc-evidence-section"><strong>${escapeHtml(label)}</strong>
    <ul class="hmrc-evidence-list">${files.map((file) => `<li>
      <span>${escapeHtml(file.name)}</span>
      ${evidenceActionMarkup(file, editingAllowed)}
    </li>`).join('') || '<li class="muted">No documents</li>'}</ul>
    ${editingAllowed ? `<button type="button" class="secondary-btn company-attach-document-btn" data-hmrc-attach="${escapeHtml(ruleKey)}">${ATTACHMENT_ICON}<span>Attach document</span></button>` : ''}
  </div>`;
}

function renderHmrcFilingEvidence(periodEnd = $('hmrcRecordPeriod').value) {
  const ruleKey = periodEnd ? 'corporation-tax-return:' + periodEnd : '';
  const files = (profile.complianceEvidence || []).filter((file) => file.ruleKey === ruleKey);
  const input = $('hmrcFilingEvidenceInput');
  input.dataset.evidenceUpload = ruleKey;
  input.disabled = !editingAllowed || !periodEnd;
  const status = $('hmrcFilingEvidenceStatus');
  status.textContent = files.length ? `Evidence attached (${files.length})` : 'No evidence attached';
  status.classList.toggle('is-attached', files.length > 0);
  $('hmrcFilingEvidenceFiles').innerHTML = files.map((file) => `<li><span>${escapeHtml(file.name)}</span>${evidenceActionMarkup(file, editingAllowed)}</li>`).join('') || '<li class="muted">No documents attached.</li>';
  $('hmrcFilingEvidenceMessage').textContent = '';
}

function hmrcPaymentEvidenceRuleKey(periodEnd, paymentId) {
  return periodEnd && paymentId ? 'corporation-tax-payment:' + periodEnd + ':' + paymentId : '';
}

function renderHmrcPaymentEvidence(periodEnd = $('hmrcPaymentPeriod').value, paymentId = hmrcPaymentEditingId) {
  const ruleKey = hmrcPaymentEvidenceRuleKey(periodEnd, paymentId);
  const input = $('hmrcPaymentEvidenceInput');
  input.dataset.evidenceUpload = ruleKey;
  input.disabled = !editingAllowed || !ruleKey;
  const files = (profile.complianceEvidence || []).filter((file) => file.ruleKey === ruleKey);
  $('hmrcPaymentEvidenceFiles').innerHTML = files.map((file) => {
    const id = escapeHtml(file.id);
    const name = escapeHtml(file.name);
    return '<li><span><strong>' + name + '</strong><small>' + Math.ceil(file.size / 1024) + ' KB · ' + escapeHtml(formatComplianceDateUK(file.uploadedAt?.slice(0, 10) || '') || 'Date unknown') + '</small></span>' +
      '<button type="button" class="icon-btn company-evidence-action" data-evidence-view="' + id + '" aria-label="View ' + name + '" title="View ' + name + '">' + VIEW_ICON + '</button>' +
      evidenceActionMarkup(file, editingAllowed) + '</li>';
  }).join('') || (input.files?.length ? '' : '<li class="muted">No receipts attached.</li>');
}
function hmrcLegacyPaymentEvidenceMarkup(periodEnd) {
  const ruleKey = 'corporation-tax-payment:' + periodEnd;
  if (!(profile.complianceEvidence || []).some((file) => file.ruleKey === ruleKey)) return '';
  const files = profile.complianceEvidence.filter((file) => file.ruleKey === ruleKey);
  return `<div class="hmrc-evidence-section"><strong>Receipts not linked to a payment</strong>
    <ul class="hmrc-evidence-list">${files.map((file) => `<li><span>${escapeHtml(file.name)}</span>${evidenceActionMarkup(file, editingAllowed)}</li>`).join('')}</ul>
  </div>`;
}

function renderHmrcDashboard() {
  const setup = normalizeHmrcTracking(profile.hmrc).setup;
  const state = hmrcOverviewState(profile.hmrc);
  const periods = hmrcTaxPeriods(profile.hmrc);
  const utrLabel = setup.utrReceivedOn ? 'Received ' + formatComplianceDateUK(setup.utrReceivedOn)
    : setup.utrStatus === 'pending' ? 'Waiting' : 'Not recorded';
  const activityLabel = ({ preparing: 'Preparing to buy', active: 'Business started', dormant: 'Dormant' })[state.activity] || 'Not recorded';
  const complete = state.setupRecorded;
  const total = state.setupTotal;
  const activityActive = state.activity === 'active';
  const registrationVisible = activityActive;
  const registrationDone = Boolean(setup.registrationConfirmedOn);
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const nextDue = periods.flatMap((period) => Object.values(hmrcDeadlines(period)))
    .filter((date) => date >= today).sort()[0];
  $('hmrcAuthorityProgress').textContent = complete === total
    ? 'Setup ' + complete + ' of ' + total + ' complete'
    : 'Setup ' + complete + ' of ' + total + ' recorded';
  $('hmrcAuthoritySummary').textContent = periods.length
    ? periods.length + ' tax period' + (periods.length === 1 ? '' : 's') + (nextDue ? ' · Next due ' + formatComplianceDateUK(nextDue) : ' · No upcoming deadlines')
    : 'No tax periods recorded yet';
  $('hmrcSetupCards').innerHTML = `
    <article class="hmrc-setup-card">
      <div><h5>UTR letter</h5>${hmrcBadge(utrLabel, setup.utrReceivedOn ? 'success' : setup.utrStatus === 'pending' ? 'warning' : 'neutral')}</div>
      <button class="secondary-btn company-edit-icon-btn" type="button" data-hmrc-open="utr" aria-label="Edit UTR letter" title="Edit UTR letter" ${editingAllowed ? '' : 'disabled'}>${EDIT_ICON}</button>
      <details class="hmrc-card-documents"><summary>Documents</summary>${hmrcEvidenceMarkup('company-utr-received:once', 'UTR letter')}</details>
    </article>
    <article class="hmrc-setup-card">
      <div><h5>Company activity</h5>${hmrcBadge(activityLabel, activityActive ? 'success' : state.activity === 'preparing' ? 'warning' : 'neutral')}</div>
      <button class="secondary-btn company-edit-icon-btn" type="button" data-hmrc-open="activity" aria-label="Edit company activity" title="Edit company activity" ${editingAllowed ? '' : 'disabled'}>${EDIT_ICON}</button>
    </article>
    ${registrationVisible ? `<article class="hmrc-setup-card">
      <div><h5>Corporation Tax registration</h5>${hmrcBadge(registrationDone ? 'Confirmed' : setup.registrationStatus === 'pending' ? 'Awaiting confirmation' : 'Not recorded', registrationDone ? 'success' : 'warning')}</div>
      <button class="secondary-btn company-edit-icon-btn" type="button" data-hmrc-open="registration" aria-label="Edit Corporation Tax registration" title="Edit Corporation Tax registration" ${editingAllowed ? '' : 'disabled'}>${EDIT_ICON}</button>
      <details class="hmrc-card-documents"><summary>Documents</summary>${hmrcEvidenceMarkup('corporation-tax-registration:once', 'Registration proof')}</details>
    </article>` : ''}`;
  $('hmrcOpenPeriodDialog').disabled = !editingAllowed || !activityActive || !state.registrationAnswered;
  const notes = [];
  if (periods.some((period) => {
    const due = hmrcDeadlines(period);
    const record = hmrcPeriodSummary(profile.hmrc, period.periodEnd);
    return (due['corporation-tax-payment'] < today && (record.outstanding === null || record.outstanding > 0))
      || (due['corporation-tax-return'] < today && !record.filedOn);
  })) notes.push('Check overdue HMRC deadlines');
  $('hmrcStatusNote').textContent = notes.join(' · ');
  $('hmrcStatusNote').hidden = !notes.length;
}

$('hmrcOpenPeriodDialog').addEventListener('click', (event) => {
  if (!editingAllowed) return;
  $('hmrcPeriodMessage').textContent = '';
  $('hmrcPeriodStart').value = '';
  $('hmrcPeriodEnd').value = '';
  $('hmrcTaxStatus').value = 'active';
  hmrcDialogs.period.open(event.currentTarget);
});
$('hmrcSetupCards').addEventListener('click', (event) => {
  const attach = event.target.closest('[data-hmrc-attach]');
  if (attach && editingAllowed) {
    $('hmrcEvidenceInput').dataset.evidenceUpload = attach.dataset.hmrcAttach;
    $('hmrcEvidenceInput').value = '';
    $('hmrcEvidenceMessage').textContent = '';
    hmrcDialogs.evidence.open(attach);
    return;
  }
  const button = event.target.closest('[data-hmrc-open]');
  if (!button || !editingAllowed) return;
  const step = button.dataset.hmrcOpen;
  hmrcGuideSelected = step;
  if (step === 'activity') {
    const selected = $('hmrcActivityForm').querySelector('input[value="' + (normalizeHmrcTracking(profile.hmrc).setup.activityStage || '') + '"]');
    if (selected) selected.checked = true;
    $('hmrcActivityMessage').textContent = '';
    hmrcDialogs.activity.open(button);
    return;
  }
  const isUtr = step === 'utr';
  $('hmrcSetupDialogTitle').textContent = isUtr ? 'UTR letter' : 'Corporation Tax registration';
  $('hmrcSetupSaveBtn').textContent = isUtr ? 'Save date' : 'Save registration';
  $('hmrcPendingBtn').textContent = isUtr ? 'Still waiting' : 'Not yet confirmed';
  $('hmrcSetupForm').querySelectorAll('[data-hmrc-setup-field]').forEach((label) => { label.hidden = label.dataset.hmrcSetupField !== step; });
  $('hmrcSetupMessage').textContent = '';
  hmrcDialogs.setup.open(button);
});
function hmrcRecordPeriodOptions(selectedId) {
  const periods = hmrcTaxPeriods(profile.hmrc);
  return periods.map((period) => `<option value="${escapeHtml(period.periodEnd)}" ${selectedId === period.periodEnd ? 'selected' : ''}>${escapeHtml(formatComplianceDateUK(period.periodStart))} – ${escapeHtml(formatComplianceDateUK(period.periodEnd))}</option>`).join('');
}
$('hmrcPaymentPeriod').addEventListener('change', () => {
  $('hmrcPaymentEvidenceMessage').textContent = '';
  $('hmrcPaymentEvidenceSelection').textContent = 'No receipt selected';
  renderHmrcPaymentEvidence($('hmrcPaymentPeriod').value, hmrcPaymentEditingId);
});

function fillHmrcFilingForm(periodEnd) {
  const selected = hmrcPeriodSummary(profile.hmrc, periodEnd);
  $('hmrcFiledOn').value = selected.filedOn;
  $('hmrcFilingReference').value = selected.filingReference;
  $('hmrcLiabilityStatus').value = selected.liability === null ? 'unknown' : selected.liabilityStatus || 'recorded';
  $('hmrcPeriodPaymentReference').value = selected.paymentReference || '';
  $('hmrcLiability').value = selected.liability === null ? '' : String(selected.liability);
  $('hmrcReviewedOn').value = selected.reviewedOn;
  $('hmrcReviewedBy').value = selected.reviewedBy;
}
function renderHmrcTracking() {
  const periods = hmrcTaxPeriods(profile.hmrc);
  const setup = normalizeHmrcTracking(profile.hmrc).setup;
  $('hmrcUtrReceivedOn').value = setup.utrReceivedOn;
  $('hmrcRegistrationConfirmedOn').value = setup.registrationConfirmedOn;
  $('hmrcRegistrationReference').value = setup.registrationReference;
  $('hmrcAccountantName').value = setup.accountantName;
  $('hmrcSetupForm').querySelectorAll('input,button').forEach((element) => { element.disabled = !editingAllowed; });
  const selectedPeriod = periods.some((p) => p.periodEnd === $('hmrcRecordPeriod').value) ? $('hmrcRecordPeriod').value : periods[0]?.periodEnd || '';
  const paymentPeriod = periods.some((p) => p.periodEnd === $('hmrcPaymentPeriod').value) ? $('hmrcPaymentPeriod').value : selectedPeriod;
  $('hmrcRecordPeriod').innerHTML = hmrcRecordPeriodOptions(selectedPeriod);
  $('hmrcPaymentPeriod').innerHTML = hmrcRecordPeriodOptions(paymentPeriod);
  fillHmrcFilingForm(selectedPeriod);
  renderHmrcFilingEvidence(selectedPeriod);
  for (const form of [$('hmrcFilingForm'), $('hmrcPaymentForm')]) {
    form.querySelectorAll('input,select,button').forEach((element) => {
      const receiptReadAction = form.id === 'hmrcPaymentForm' && element.matches('[data-evidence-view], [data-evidence-download]');
      element.disabled = !receiptReadAction && (!editingAllowed || !periods.length);
    });
  }
  renderHmrcPaymentEvidence($('hmrcPaymentPeriod').value);
  $('hmrcPeriodHistory').innerHTML = periods.length
    ? '<div class="hmrc-period-cards">' + [...periods].reverse().map((period) => {
      const record = hmrcPeriodSummary(profile.hmrc, period.periodEnd);
      const due = hmrcDeadlines(period);
      const liabilityKnown = record.liability !== null;
      const filingDate = due['corporation-tax-return'];
      const paymentDate = due['corporation-tax-payment'];
      const noTaxDue = liabilityKnown && record.liability === 0;
      const isPaid = liabilityKnown && record.liability > 0 && record.outstanding === 0 && record.overpayment === 0;
      const recordedFiling = Boolean(record.filedOn);
      const filingEvidence = (profile.complianceEvidence || []).filter((file) => file.ruleKey === 'corporation-tax-return:' + period.periodEnd);
      return `<article class="hmrc-period-card">
        <header class="hmrc-period-header">
          <div class="hmrc-period-heading">
            <h5>${hmrcDate(period.periodStart)} – ${hmrcDate(period.periodEnd)}</h5>
            <div class="hmrc-period-badges">
              ${hmrcBadge(recordedFiling ? 'CT600 recorded' : 'CT600 not recorded', recordedFiling ? 'success' : 'attention')}
              ${hmrcBadge(noTaxDue ? 'No tax due (recorded)' : isPaid ? 'Tax paid' : liabilityKnown && record.outstanding > 0 ? 'Payment outstanding' : 'Tax not assessed', noTaxDue || isPaid ? 'success' : 'attention')}
            </div>
            <p class="hmrc-deadlines">Pay by ${hmrcDate(paymentDate)} · CT600 by ${hmrcDate(filingDate)} <span>(estimates)</span></p>
          </div>
          <div class="hmrc-period-actions">
            <button type="button" class="secondary-btn danger-text" data-hmrc-period-remove="${escapeHtml(period.periodEnd)}" ${editingAllowed ? '' : 'disabled'}>Delete period</button>
          </div>
        </header>
        <div class="hmrc-period-grid">
          <section class="hmrc-period-info">
            <div class="hmrc-period-info-heading"><h6>CT600 return</h6>
              <button type="button" class="icon-btn hmrc-filing-action" data-hmrc-open="filing" data-hmrc-period="${escapeHtml(period.periodEnd)}" aria-label="${recordedFiling ? 'Edit' : 'Record'} CT600" title="${recordedFiling ? 'Edit' : 'Record'} CT600" ${editingAllowed ? '' : 'disabled'}>${recordedFiling ? EDIT_ICON : PLUS_ICON}</button>
            </div>
            <div class="hmrc-period-status-row">${hmrcBadge(recordedFiling ? 'Recorded filed' : 'Not recorded', recordedFiling ? 'success' : 'attention')}${hmrcBadge(filingEvidence.length ? 'Evidence attached' : 'No evidence attached', filingEvidence.length ? 'success' : 'neutral')}</div>
            <dl><dt>Submitted</dt><dd>${hmrcDate(record.filedOn)}</dd>
              <dt>Reference</dt><dd>${escapeHtml(record.filingReference) || '—'}</dd>
              <dt>Reviewed by</dt><dd>${escapeHtml(record.reviewedBy) || '—'}</dd>
              <dt>Reviewed on</dt><dd>${hmrcDate(record.reviewedOn)}</dd></dl>
          </section>
          <section class="hmrc-period-info">
            <div class="hmrc-period-info-heading"><h6>Financial summary</h6>
              <button type="button" class="icon-btn hmrc-payment-add" data-hmrc-open="payment" data-hmrc-period="${escapeHtml(period.periodEnd)}" aria-label="Add tax payment" title="Add tax payment" ${editingAllowed ? '' : 'disabled'}>${PLUS_ICON}</button>
            </div>
            <dl><dt>Tax liability</dt><dd class="${liabilityKnown ? '' : 'hmrc-value-attention'}">${liabilityKnown ? CURRENCY_FORMAT.format(record.liability) : 'Not assessed'}</dd>
              <dt>Liability status</dt><dd class="${liabilityKnown ? '' : 'hmrc-value-attention'}">${liabilityKnown ? escapeHtml(({ estimated: 'Estimated', confirmed: 'Confirmed', recorded: 'Recorded' })[record.liabilityStatus] || 'Recorded') : 'Unknown'}</dd>
              <dt>Total paid</dt><dd class="hmrc-value-positive">${CURRENCY_FORMAT.format(record.paid)}</dd>
              <dt class="hmrc-summary-total">Outstanding</dt><dd class="hmrc-summary-total ${record.outstanding === null || record.outstanding > 0 ? 'hmrc-value-attention' : 'hmrc-value-positive'}">${record.outstanding === null ? 'Unknown' : CURRENCY_FORMAT.format(record.outstanding)}</dd></dl>
            ${record.overpayment ? `<p class="hmrc-value-warning">Overpayment: ${CURRENCY_FORMAT.format(record.overpayment)}</p>` : ''}
          </section>
          <section class="hmrc-period-info">
            <h6>HMRC payment details</h6>
            <p class="muted">Reference for this period</p>
            <div class="hmrc-reference-row"><strong class="hmrc-ref" data-hmrc-ref-value="${escapeHtml(period.periodEnd)}">${hmrcDisplayReference(record.paymentReference)}</strong>
            ${record.paymentReference ? `<button class="secondary-btn hmrc-ref-toggle" data-hmrc-reveal-ref="${escapeHtml(period.periodEnd)}" type="button" aria-label="Show payment reference for period ending ${escapeHtml(formatComplianceDateUK(period.periodEnd))}">Show</button>` : ''}</div>
            <p class="muted">Check your HMRC account before paying.</p>
          </section>
        </div>
        <div class="hmrc-payments">
          <h6>Recorded payments <span class="muted">(${record.payments.length})</span></h6>
          ${record.payments.length ? `<div class="hmrc-payment-table-wrap"><table class="hmrc-payment-table">
            <thead><tr><th scope="col">Paid on</th><th scope="col">Amount</th><th scope="col">Reference</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
            <tbody>${record.payments.map((payment) => `<tr>
              <td>${hmrcDate(payment.date)}</td><td>${CURRENCY_FORMAT.format(payment.amount)}</td>
              <td>${escapeHtml(payment.reference) || '—'}</td>
              <td>${hmrcBadge(payment.status === 'hmrc-confirmed' ? 'HMRC confirmed' : 'Recorded', payment.status === 'hmrc-confirmed' ? 'success' : 'neutral')}</td>
              <td>${editingAllowed ? `<span class="hmrc-payment-actions"><button class="icon-btn company-evidence-action" type="button" data-hmrc-payment-edit="${escapeHtml(payment.id)}" data-hmrc-payment-period="${escapeHtml(period.periodEnd)}" aria-label="Edit payment ${hmrcDate(payment.date)}" title="Edit payment">${EDIT_ICON}</button><button class="icon-btn company-evidence-action company-evidence-action--remove" type="button" data-hmrc-payment-remove="${escapeHtml(payment.id)}" data-hmrc-payment-period="${escapeHtml(period.periodEnd)}" aria-label="Delete payment ${hmrcDate(payment.date)}" title="Delete payment">${REMOVE_ICON}</button></span>` : '—'}</td></tr>`).join('')}</tbody></table></div>`
          : '<p class="hmrc-payments-empty">No payments recorded.</p>'}
        </div>
        <details class="hmrc-card-documents"><summary>Supporting documents</summary>
          <div class="hmrc-doc-grid">${hmrcLegacyPaymentEvidenceMarkup(period.periodEnd)}</div>
        </details>
      </article>`;
    }).join('') + '</div>'
    : '<div class="hmrc-period-empty"><p>No tax periods recorded yet.</p><p class="muted">Add the dates confirmed by HMRC or your accountant.</p></div>';
}

function renderProfile() {
  profile = getCompanyProfile();
  $('companyNameValue').textContent = profile.companyName || 'Not added';
  $('companyNumberValue').textContent = profile.companyNumber || 'Not recorded';
  $('companyOfficeValue').textContent = profile.registeredOffice || 'Not recorded';
  $('companyStatusValue').textContent = displayCompanyStatus(profile.companyStatus) || 'Not recorded';
  $('companyDateValue').textContent = profile.incorporationDate
    ? formatDate(`${profile.incorporationDate}T00:00:00`, { day: 'numeric', month: 'long', year: 'numeric' }, 'Not recorded')
    : 'Not recorded';
  $('companyEmptyHint').classList.toggle('hidden', Boolean(profile.companyName));
  $('editCompanyDetailsBtn').disabled = !editingAllowed;
  $('openDeleteCompanyBtn').disabled = !deleteAllowed || Boolean(profile.deletedAt);
  $('addAppointmentBtn').disabled = !editingAllowed;
  renderAppointments();
  renderInvestments();
  renderCompanyCompliance();
  renderHmrcTracking();
  renderHmrcDashboard();
}

async function refreshCompanyHouseDeadlines() {
  const companyNumber = String(profile.companyNumber || '').trim().toUpperCase();
  if (lookupCompanyNumber !== companyNumber) {
    companyHouseData = null;
    lookupCompanyNumber = companyNumber;
  }
  if (!companyNumber || !navigator.onLine || !window.SPVCloud?.getCompanyHouseDeadlines) {
    companyHouseError = !companyNumber ? '' : !navigator.onLine ? 'Connect to check Companies House.' : 'Companies House lookup is not configured.';
    renderAppointments();
    renderCompanyCompliance();
    return;
  }

  companyHouseError = 'Checking Companies House…';
  renderAppointments();
  renderCompanyCompliance();
  try {
    const data = await window.SPVCloud.getCompanyHouseDeadlines(companyNumber);
    if (String(profile.companyNumber || '').trim().toUpperCase() !== companyNumber || lookupCompanyNumber !== companyNumber) return;
    companyHouseData = data;
    companyHouseError = '';
  } catch (error) {
    if (lookupCompanyNumber !== companyNumber) return;
    companyHouseData = null;
    companyHouseError = 'Lookup unavailable';
    console.warn('Companies House lookup failed:', error);
  }
  renderAppointments();
  renderCompanyCompliance();
}

function setCompanySearchStatus(message, kind = 'info') {
  const status = $('companySearchStatus');
  status.textContent = message;
  status.classList.toggle('is-error', Boolean(message) && kind === 'error');
  status.classList.toggle('is-success', Boolean(message) && kind === 'success');
  status.setAttribute('role', kind === 'error' ? 'alert' : 'status');
}

function companyDetailsError(message) {
  const status = $('companyDetailsMessage');
  status.textContent = message;
  status.classList.toggle('is-error', Boolean(message));
  status.setAttribute('role', message ? 'alert' : 'status');
}

async function searchCompanyParticulars() {
  if (!editingAllowed) return;
  const query = $('companySearchInput').value.trim();
  const requestId = ++companySearchSequence;
  $('companySearchResults').replaceChildren();
  if (query.length < 2) {
    setCompanySearchStatus('Enter at least two characters to search.', 'error');
    return;
  }
  if (!navigator.onLine || !window.SPVCloud?.searchCompaniesHouse) {
    setCompanySearchStatus('Company search requires an internet connection and sign-in.', 'error');
    return;
  }
  $('companySearchBtn').disabled = true;
  setCompanySearchStatus('Searching Companies House…');
  try {
    const matches = await window.SPVCloud.searchCompaniesHouse(query);
    if (requestId !== companySearchSequence || !detailsDialog.dialog.open) return;
    setCompanySearchStatus(matches.length ? `${matches.length} matching companies. Select the correct company.` : 'No matching companies found.', matches.length ? 'info' : 'error');
    $('companySearchResults').innerHTML = matches.map((item) => `<div class="company-search-result">
      <span><strong>${escapeHtml(item.companyName)}</strong><small>${escapeHtml(item.companyNumber)} · ${escapeHtml(displayCompanyStatus(item.companyStatus) || 'Status unknown')}${item.registeredOffice ? ' · ' + escapeHtml(item.registeredOffice) : ''}</small></span>
      <button type="button" class="secondary-btn" data-company-lookup="${escapeHtml(item.companyNumber)}" aria-label="Select ${escapeHtml(item.companyName)}">Select</button>
    </div>`).join('');
  } catch (error) {
    if (requestId === companySearchSequence) setCompanySearchStatus(error.message || 'Company search failed.', 'error');
  } finally {
    if (requestId === companySearchSequence) $('companySearchBtn').disabled = !editingAllowed;
  }
}

async function selectCompanyParticulars(companyNumber) {
  if (!editingAllowed || !/^[A-Z0-9]{2}[0-9]{6}$/.test(companyNumber)) return;
  const anotherCompany = listStoredCompanyProfiles().find((item) =>
    item.id !== profile.id && item.companyNumber.trim().toUpperCase() === companyNumber);
  if (anotherCompany) {
    setCompanySearchStatus('This registered company already has a card. Return to All companies to open it.', 'error');
    return;
  }
  const previousNumber = String(profile.companyNumber || '').trim().toUpperCase();
  if (previousNumber && previousNumber !== companyNumber) {
    setCompanySearchStatus('This is a different registered company. Return to All companies and choose Add new company.', 'error');
    return;
  }
  const requestId = ++companySearchSequence;
  $('companySearchBtn').disabled = true;
  setCompanySearchStatus('Retrieving official company particulars…');
  try {
    const official = await window.SPVCloud.getCompanyHouseDeadlines(companyNumber);
    if (requestId !== companySearchSequence || !detailsDialog.dialog.open) return;
    if (String(official.companyNumber).toUpperCase() !== companyNumber) throw new Error('Unexpected company number returned.');
    $('companyNameInput').value = official.companyName || '';
    $('companyNumberInput').value = official.companyNumber;
    $('companyOfficeInput').value = official.registeredOffice || '';
    $('companyStatusInput').value = displayCompanyStatus(official.companyStatus);
    $('companyDateInput').value = official.incorporationDate || '';
    setCompanySearchStatus('Official details populated. Review them and press Save to update the workspace.', 'success');
    $('companySearchResults').replaceChildren();
  } catch (error) {
    if (requestId === companySearchSequence) setCompanySearchStatus(error.message || 'Company lookup failed.', 'error');
  } finally {
    if (requestId === companySearchSequence) $('companySearchBtn').disabled = !editingAllowed;
  }
}

function showDetailsDialog() {
  $('companyNameInput').value = profile.companyName;
  $('companyNumberInput').value = profile.companyNumber;
  $('companyOfficeInput').value = profile.registeredOffice;
  $('companyStatusInput').value = profile.companyStatus;
  $('companyDateInput').value = profile.incorporationDate;
  companySearchSequence += 1;
  $('companySearchInput').value = '';
  $('companySearchResults').replaceChildren();
  setCompanySearchStatus('');
  $('companySearchBtn').disabled = !editingAllowed;
  companyDetailsError('');
  detailsDialog.open($('editCompanyDetailsBtn'));
}

function openAppointment(id = '') {
  const appointment = profile.appointments.find((item) => item.id === id);
  $('appointmentIdInput').value = appointment?.id || '';
  $('appointmentNameInput').value = appointment?.name || '';
  document.querySelectorAll('[data-appointment-role]').forEach((checkbox) => {
    checkbox.checked = Boolean(appointment?.roles.includes(checkbox.value));
  });
  $('appointmentDialogTitle').textContent = appointment ? 'Edit person' : 'Add person';
  $('deleteAppointmentBtn').classList.toggle('hidden', !appointment);
  $('appointmentMessage').textContent = '';
  const trigger = appointment
    ? [...document.querySelectorAll('[data-edit-appointment]')].find((button) => button.dataset.editAppointment === id)
    : $('addAppointmentBtn');
  appointmentDialog.open(trigger || document.activeElement);
}

async function syncAfterSave() {
  if (!navigator.onLine || !window.SPVCloud?.getCurrentUser?.()) {
    setSyncStatus(profile._cloudDirty ? 'Saved on this device · sync pending' : 'Saved on this device');
    return;
  }
  setSyncStatus('Syncing company details…');
  try {
    const result = await syncCompanyProfile(window.SPVCloud);
    window.dispatchEvent(new CustomEvent('spv-workspace-synced'));
    if (result.conflicts.length) setSyncStatus('Sync conflict · local changes kept', 'error');
    else setSyncStatus('Company details synced', 'synced');
  } catch (error) {
    console.warn('Company profile sync failed:', error);
    setSyncStatus('Saved on this device · sync pending', 'error');
  }
}


function setEvidenceMessage(message, isError = false) {
  const el = $('companyEvidenceStatus');
  el.textContent = message;
  const dialogMessage = $('companyComplianceDialogMessage');
  if (dialogMessage) { dialogMessage.textContent = message; dialogMessage.classList.toggle('is-error', isError); }
  el.classList.toggle('is-error', isError);
  el.setAttribute('role', isError ? 'alert' : 'status');
}

async function requireEvidenceEditor() {
  if (!navigator.onLine) throw new Error('An internet connection is required for evidence changes.');
  const access = await window.SPVCloud?.getWorkspaceAccess?.();
  if (!editingAllowed || !access?.active || !['admin', 'editor'].includes(access.role)) {
    throw new Error('Approved editor access is required.');
  }
}
function restoreEvidenceDisclosure(ruleKey) {
  const upload = [...document.querySelectorAll('[data-evidence-upload]')].find((element) => element.dataset.evidenceUpload === ruleKey && element.closest('details'));
  const attach = [...document.querySelectorAll('[data-hmrc-attach]')].find((element) => element.dataset.hmrcAttach === ruleKey);
  (upload || attach)?.closest('details')?.setAttribute('open', '');
}

$('complianceTabPanel').addEventListener('change', async (event) => {
  const input = event.target.closest('[data-evidence-upload]');
  if (!input?.files?.length) return;
  const ruleKey = input.dataset.evidenceUpload;
  const file = input.files[0];
  if (input.id === 'hmrcPaymentEvidenceInput') {
    try {
      validateEvidenceFile(file);
      $('hmrcPaymentEvidenceMessage').textContent = 'Save the payment to attach this receipt to it.';
    } catch (error) {
      $('hmrcPaymentEvidenceMessage').textContent = error.message || 'Select a valid receipt.';
    }
    renderHmrcPaymentEvidence($('hmrcPaymentPeriod').value, hmrcPaymentEditingId);
    return;
  }
  input.disabled = true;
  setEvidenceMessage('Uploading compliance evidence…');
  try {
    validateEvidenceFile(file);
    await requireEvidenceEditor();
    const before = await syncCompanyProfile(window.SPVCloud);
    if (before.conflicts.length || getCompanyProfile()._cloudDirty) throw new Error('Resolve company sync before uploading evidence.');
    profile = getCompanyProfile();
    const uploaded = await uploadComplianceEvidence(profile.id, file);
    try {
      addCompanyEvidence({ ...uploaded, ruleKey });
    } catch (error) {
      await deleteComplianceEvidence(profile.id, uploaded).catch(() => {});
      throw error;
    }
    const saved = await syncCompanyProfile(window.SPVCloud);
    if (saved.conflicts.length || getCompanyProfile()._cloudDirty) {
      throw new Error('Evidence uploaded, but metadata sync is pending. Retry company sync; do not upload it again.');
    }
    profile = getCompanyProfile();
    renderCompanyCompliance();
    renderHmrcTracking();
    renderHmrcDashboard();
    if (input.id === 'companyComplianceEvidenceInput') renderCompanyComplianceDialog(ruleKey, false);
    else if (input.id === 'hmrcFilingEvidenceInput') renderHmrcFilingEvidence($('hmrcRecordPeriod').value);
    else { hmrcDialogs.evidence.close(); restoreEvidenceDisclosure(ruleKey); }
    if (input.id === 'hmrcPaymentEvidenceInput') {
      renderHmrcPaymentEvidence($('hmrcPaymentPeriod').value);
      $('hmrcPaymentEvidenceMessage').textContent = 'Receipt uploaded and saved.';
    }
    setEvidenceMessage('Evidence uploaded and saved.');
  } catch (error) {
    setEvidenceMessage(error.message || 'Evidence upload failed.', true);
    if (input.id === 'hmrcPaymentEvidenceInput') $('hmrcPaymentEvidenceMessage').textContent = error.message || 'Receipt upload failed.';
    else if (input.id === 'hmrcFilingEvidenceInput') $('hmrcFilingEvidenceMessage').textContent = error.message || 'Upload failed.';
    else $('hmrcEvidenceMessage').textContent = error.message || 'Upload failed.';
  } finally {
    input.disabled = input.id === 'hmrcPaymentEvidenceInput' ? (!editingAllowed || !input.dataset.evidenceUpload) : !editingAllowed;
    input.value = '';
    const status = input.closest('file-upload-field')?.querySelector('.receipt-file-size');
    if (status) status.textContent = 'No file selected';
  }
});

$('complianceTabPanel').addEventListener('click', async (event) => {
  const view = event.target.closest('[data-evidence-view]');
  const download = event.target.closest('[data-evidence-download]');
  const remove = event.target.closest('[data-evidence-remove]');
  if (!view && !download && !remove) return;
  const action = view || download || remove;
  const id = action.dataset[view ? 'evidenceView' : download ? 'evidenceDownload' : 'evidenceRemove'];
  const entry = getCompanyProfile().complianceEvidence.find((item) => item.id === id);
  if (!entry) { setEvidenceMessage('This document is no longer attached. Refresh the page.', true); return; }
  const button = action;
  const preview = view ? window.open('about:blank', '_blank') : null;
  button.disabled = true;
  try {
    if (view) {
      if (!preview) throw new Error('Allow pop-ups to view this receipt.');
      await viewComplianceEvidence(profile.id, entry, preview);
      $('hmrcPaymentEvidenceMessage').textContent = 'Receipt opened in a new tab.';
    } else if (download) {
      await downloadComplianceEvidence(profile.id, entry);
      setEvidenceMessage('Document downloaded.');
    } else {
      await requireEvidenceEditor();
      if (!window.confirm('Remove ' + entry.name + ' from this compliance requirement?')) return;
      const before = await syncCompanyProfile(window.SPVCloud);
      if (before.conflicts.length || getCompanyProfile()._cloudDirty) throw new Error('Resolve company sync before removing evidence.');
      const existing = getCompanyProfile().complianceEvidence.find((item) => item.id === id);
      if (!existing) throw new Error('Document was changed on another device. Refresh first.');
      removeCompanyEvidence(id);
      const saved = await syncCompanyProfile(window.SPVCloud);
      if (saved.conflicts.length || getCompanyProfile()._cloudDirty) {
        throw new Error('Removal saved locally, but cloud sync is pending. Retry before deleting the stored file.');
      }
      await deleteComplianceEvidence(profile.id, existing);
      profile = getCompanyProfile();
      renderCompanyCompliance();
      renderHmrcTracking();
      renderHmrcDashboard();
      if (entry.ruleKey.startsWith('corporation-tax-payment:')) renderHmrcPaymentEvidence($('hmrcPaymentPeriod').value);
      restoreEvidenceDisclosure(entry.ruleKey);
      setEvidenceMessage('Evidence removed.');
    }
  } catch (error) {
    preview?.close();
    setEvidenceMessage(error.message || 'Evidence action failed.', true);
    if (view) $('hmrcPaymentEvidenceMessage').textContent = error.message || 'Unable to view receipt.';
  } finally {
    button.disabled = false;
  }
});

$('deleteHmrcPeriodForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = $('deleteHmrcPeriodMessage');
  if (!editingAllowed) { message.textContent = 'Editor permission is required.'; return; }
  if ($('confirmDeleteHmrcPeriodInput').value.trim() !== 'DELETE') {
    message.textContent = 'Type DELETE exactly to confirm.';
    return;
  }
  const periodEnd = hmrcPeriodToDelete;
  if (!periodEnd) { message.textContent = 'Select a tax period to delete.'; return; }
  const button = $('confirmDeleteHmrcPeriodBtn');
  button.disabled = true;
  try {
    if (!hmrcTaxPeriods(profile.hmrc).some((period) => period.periodEnd === periodEnd)) {
      throw new Error('This tax period no longer exists. Refresh the company records.');
    }
    if (navigator.onLine && window.SPVCloud?.getCurrentUser?.()) {
      const before = await syncCompanyProfile(window.SPVCloud);
      if (before.conflicts.length || getCompanyProfile()._cloudDirty) {
        throw new Error('Resolve company sync before deleting a tax period.');
      }
      profile = getCompanyProfile();
    }
    const period = hmrcTaxPeriods(profile.hmrc).find((item) => item.periodEnd === periodEnd);
    if (!period) throw new Error('This tax period changed during sync. Refresh and try again.');
    const paymentPrefix = 'corporation-tax-payment:' + periodEnd;
    const files = (profile.complianceEvidence || []).filter((file) =>
      file.ruleKey === 'corporation-tax-return:' + periodEnd
      || file.ruleKey === paymentPrefix
      || String(file.ruleKey || '').startsWith(paymentPrefix + ':')
    );
    if (files.length) await requireEvidenceEditor();
    const hmrc = removeHmrcPeriod(profile.hmrc, periodEnd);
    profile = saveCompanyProfile({ ...profile, hmrc });
    for (const file of files) removeCompanyEvidence(file.id);
    if (files.length) {
      const saved = await syncCompanyProfile(window.SPVCloud);
      if (saved.conflicts.length || getCompanyProfile()._cloudDirty) {
        throw new Error('Tax period was deleted locally, but document removal is pending sync. Retry company sync before removing stored files.');
      }
      for (const file of files) await deleteComplianceEvidence(profile.id, file);
    }
    hmrcPeriodToDelete = '';
    hmrcDialogs.deletePeriod.close();
    renderProfile();
    await syncAfterSave();
    setEvidenceMessage('Tax period and its records deleted.');
  } catch (error) {
    message.textContent = error.message || 'Unable to delete the tax period.';
  } finally {
    button.disabled = false;
  }
});

$('openDeleteCompanyBtn').addEventListener('click', () => {
  if (!deleteAllowed || profile.deletedAt) return;
  $('deleteCompanyName').textContent = profile.companyName;
  $('confirmDeleteCompanyInput').value = '';
  $('deleteCompanyMessage').textContent = '';
  deleteCompanyDialog.open($('openDeleteCompanyBtn'));
});

$('deleteCompanyForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = $('deleteCompanyMessage');
  if (!deleteAllowed) { message.textContent = 'Editor permission is required.'; return; }
  if ($('confirmDeleteCompanyInput').value.trim() !== 'DELETE') {
    message.textContent = 'Type DELETE exactly to confirm.';
    return;
  }
  if (!navigator.onLine || !window.SPVCloud?.getCurrentUser?.()) {
    message.textContent = 'Connect to the internet and sign in before deleting a company.';
    return;
  }
  const button = $('confirmDeleteCompanyBtn');
  button.disabled = true;
  try {
    const access = await window.SPVCloud.getWorkspaceAccess();
    if (!access?.active || !['admin', 'editor'].includes(access.role)) {
      throw new Error('Approved editor access is required.');
    }
    // Synchronise first: do not overwrite a newer remote company revision.
    const initialSync = await syncCompanyProfile(window.SPVCloud);
    if (initialSync.conflicts.length) throw new Error('Company records have a sync conflict. Resolve it before deleting.');
    profile = getCompanyProfile();
    if (profile.deletedAt) {
      window.location.assign(new URL('./company/', document.baseURI).href);
      return;
    }
    deleteCompanyProfile(profile.id);
    const result = await syncCompanyProfile(window.SPVCloud);
    if (result.conflicts.length || getCompanyProfile()._cloudDirty) {
      throw new Error('Deletion saved on this device, but cloud sync is pending. Retry sync before using another device.');
    }
    deleteCompanyDialog.close();
    window.location.assign(new URL('./company/', document.baseURI).href);
  } catch (error) {
    message.textContent = error.message || 'Could not delete this company.';
  } finally {
    button.disabled = false;
  }
});

$('editCompanyDetailsBtn').addEventListener('click', showDetailsDialog);
$('addAppointmentBtn').addEventListener('click', () => openAppointment());
$('addInvestmentBtn').addEventListener('click', () => openInvestment());
// These are manually maintained records, never an assertion of HMRC verification.
$('hmrcSetupForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editingAllowed) return;
  const isUtr = hmrcGuideSelected === 'utr';
  const field = $(isUtr ? 'hmrcUtrReceivedOn' : 'hmrcRegistrationConfirmedOn');
  if (!field.value) {
    $('hmrcSetupMessage').textContent = 'Enter the confirmed date, or choose Still waiting.';
    return;
  }
  try {
    const changes = isUtr
      ? { utrReceivedOn: field.value, utrStatus: 'received' }
      : {
        registrationConfirmedOn: field.value, registrationStatus: 'confirmed',
        registrationReference: $('hmrcRegistrationReference').value,
        accountantName: $('hmrcAccountantName').value
      };
    profile = saveCompanyProfile({ ...profile, hmrc: saveHmrcSetup(profile.hmrc, changes) });
    hmrcGuideSelected = '';
    renderProfile();
    hmrcDialogs.setup.close();
    await syncAfterSave();
  } catch (error) {
    $('hmrcSetupMessage').textContent = error.message || 'Unable to save HMRC details.';
  }
});

$('hmrcPendingBtn').addEventListener('click', async () => {
  if (!editingAllowed) return;
  const isUtr = hmrcGuideSelected === 'utr';
  try {
    profile = saveCompanyProfile({
      ...profile, hmrc: saveHmrcSetup(profile.hmrc,
        isUtr ? { utrReceivedOn: '', utrStatus: 'pending' } : { registrationConfirmedOn: '', registrationStatus: 'pending' })
    });
    hmrcGuideSelected = '';
    renderProfile();
    hmrcDialogs.setup.close();
    await syncAfterSave();
  } catch (error) {
    $('hmrcSetupMessage').textContent = error.message || 'Unable to record waiting status.';
  }
});

$('hmrcActivityForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editingAllowed) return;
  const selected = $('hmrcActivityForm').querySelector('input[name="hmrcActivity"]:checked')?.value;
  if (!selected) { $('hmrcActivityMessage').textContent = 'Choose a company activity status.'; return; }
  try {
    profile = saveCompanyProfile({
      ...profile, hmrc: {
        ...saveHmrcSetup(profile.hmrc, { activityStage: selected }),
        status: selected === 'preparing' ? 'unknown' : selected
      }
    });
    hmrcGuideSelected = '';
    renderProfile();
    hmrcDialogs.activity.close();
    await syncAfterSave();
  } catch (error) {
    $('hmrcActivityMessage').textContent = error.message || 'Unable to save activity.';
  }
});

$('hmrcRecordPeriod').addEventListener('change', (event) => {
  fillHmrcFilingForm(event.target.value);
  renderHmrcFilingEvidence(event.target.value);
});

$('hmrcFilingForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editingAllowed) return;
  const periodEnd = $('hmrcRecordPeriod').value;
  const liabilityText = $('hmrcLiability').value.trim();
  if (liabilityText && (!Number.isFinite(Number(liabilityText)) || Number(liabilityText) < 0 || Number(liabilityText) > 1000000000)) {
    $('hmrcFilingMessage').textContent = 'Enter a valid non-negative Corporation Tax liability.';
    return;
  }
  try {
    const hmrc = saveHmrcPeriodRecord(profile.hmrc, periodEnd, {
      filedOn: $('hmrcFiledOn').value,
      filingReference: $('hmrcFilingReference').value,
      liability: liabilityText === '' ? null : Number(liabilityText),
      liabilityStatus: liabilityText === '' ? 'unknown' : $('hmrcLiabilityStatus').value === 'unknown' ? 'recorded' : $('hmrcLiabilityStatus').value,
      paymentReference: $('hmrcPeriodPaymentReference').value.trim().toUpperCase(),
      reviewedOn: $('hmrcReviewedOn').value,
      reviewedBy: $('hmrcReviewedBy').value
    });
    profile = saveCompanyProfile({ ...profile, hmrc });
    renderProfile();
    $('hmrcRecordPeriod').value = periodEnd;
    fillHmrcFilingForm(periodEnd);
    hmrcDialogs.filing.close();
    await syncAfterSave();
  } catch (error) {
    $('hmrcFilingMessage').textContent = error.message || 'Unable to save filing details.';
  }
});

$('hmrcPaymentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editingAllowed) return;
  const periodEnd = $('hmrcPaymentPeriod').value;
  const paymentId = hmrcPaymentEditingId || globalThis.crypto?.randomUUID?.() || 'payment-' + Date.now();
  const receiptInput = $('hmrcPaymentEvidenceInput');
  const receipt = receiptInput.files?.[0] || null;
  try {
    if (receipt) {
      validateEvidenceFile(receipt);
      await requireEvidenceEditor();
    }
    const payment = {
      id: paymentId,
      date: $('hmrcPaymentDate').value,
      amount: $('hmrcPaymentAmount').value,
      reference: $('hmrcPaymentReference').value,
      method: $('hmrcPaymentMethod').value,
      status: $('hmrcPaymentConfirmed').checked ? 'hmrc-confirmed' : 'recorded'
    };
    const exists = hmrcPeriodSummary(profile.hmrc, periodEnd).payments.some((item) => item.id === paymentId);
    const hmrc = exists
      ? updateHmrcPayment(profile.hmrc, periodEnd, payment)
      : recordHmrcPayment(profile.hmrc, periodEnd, payment);
    profile = saveCompanyProfile({ ...profile, hmrc });
    hmrcPaymentEditingId = paymentId;
    hmrcPaymentIsNew = false;
    $('hmrcPaymentDialogTitle').textContent = 'Edit tax payment';
    $('hmrcPaymentSaveBtn').textContent = 'Save changes';
    $('hmrcPaymentPeriod').disabled = true;
    renderProfile();
    $('hmrcPaymentPeriod').value = periodEnd;

    if (receipt) {
      $('hmrcPaymentEvidenceMessage').textContent = 'Saving payment receipt…';
      const before = await syncCompanyProfile(window.SPVCloud);
      if (before.conflicts.length || getCompanyProfile()._cloudDirty) throw new Error('Resolve company sync before uploading the receipt.');
      profile = getCompanyProfile();
      const ruleKey = hmrcPaymentEvidenceRuleKey(periodEnd, paymentId);
      const uploaded = await uploadComplianceEvidence(profile.id, receipt);
      try {
        addCompanyEvidence({ ...uploaded, ruleKey });
      } catch (error) {
        await deleteComplianceEvidence(profile.id, uploaded).catch(() => {});
        throw error;
      }
      receiptInput.value = '';
      const selection = receiptInput.closest('file-upload-field')?.querySelector('.receipt-file-size');
      if (selection) selection.textContent = 'No receipt selected';
      const saved = await syncCompanyProfile(window.SPVCloud);
      if (saved.conflicts.length || getCompanyProfile()._cloudDirty) {
        profile = getCompanyProfile();
        renderHmrcTracking();
        renderHmrcDashboard();
        renderHmrcPaymentEvidence(periodEnd, paymentId);
        throw new Error('Receipt uploaded, but its attachment sync is pending. Retry company sync; do not upload it again.');
      }
      profile = getCompanyProfile();
      renderCompanyCompliance();
      renderHmrcTracking();
      renderHmrcDashboard();
      renderHmrcPaymentEvidence(periodEnd, paymentId);
      $('hmrcPaymentEvidenceMessage').textContent = 'Receipt uploaded and saved.';
    } else {
      await syncAfterSave();
    }

    $('hmrcPaymentDate').value = '';
    $('hmrcPaymentAmount').value = '';
    $('hmrcPaymentReference').value = '';
    receiptInput.value = '';
    hmrcDialogs.payment.close();
    hmrcPaymentEditingId = '';
    hmrcPaymentIsNew = false;
  } catch (error) {
    $('hmrcPaymentMessage').textContent = error.message || 'Unable to save payment.';
    if (hmrcPaymentEditingId) {
      $('hmrcPaymentDialogTitle').textContent = hmrcPaymentIsNew ? 'Record tax payment' : 'Edit tax payment';
      $('hmrcPaymentSaveBtn').textContent = hmrcPaymentIsNew ? 'Save payment' : 'Save changes';
    }
  }
});

$('hmrcPeriodHistory').addEventListener('click', async (event) => {
  const deletePeriodButton = event.target.closest('[data-hmrc-period-remove]');
  if (deletePeriodButton && editingAllowed) {
    const periodEnd = deletePeriodButton.dataset.hmrcPeriodRemove;
    try {
      if (!hmrcTaxPeriods(profile.hmrc).some((period) => period.periodEnd === periodEnd)) {
        throw new Error('This tax period no longer exists. Refresh the company records.');
      }
      if (navigator.onLine && window.SPVCloud?.getCurrentUser?.()) {
        const before = await syncCompanyProfile(window.SPVCloud);
        if (before.conflicts.length || getCompanyProfile()._cloudDirty) {
          throw new Error('Resolve company sync before deleting a tax period.');
        }
        profile = getCompanyProfile();
      }
      const period = hmrcTaxPeriods(profile.hmrc).find((item) => item.periodEnd === periodEnd);
      if (!period) throw new Error('This tax period changed during sync. Refresh and try again.');
      const summary = hmrcPeriodSummary(profile.hmrc, periodEnd);
      const paymentPrefix = 'corporation-tax-payment:' + periodEnd;
      const files = (profile.complianceEvidence || []).filter((file) =>
        file.ruleKey === 'corporation-tax-return:' + periodEnd
        || file.ruleKey === paymentPrefix
        || String(file.ruleKey || '').startsWith(paymentPrefix + ':')
      );
      if (files.length) await requireEvidenceEditor();
      const periodLabel = hmrcDate(period.periodStart) + ' – ' + hmrcDate(period.periodEnd);
      const confirmed = window.confirm(
        'Delete tax period ' + periodLabel + ', including its CT600 details, ' + summary.payments.length
        + ' payment' + (summary.payments.length === 1 ? '' : 's') + ', and ' + files.length
        + ' attached document' + (files.length === 1 ? '' : 's') + '? This cannot be undone.'
      );
      if (!confirmed) return;
      const hmrc = removeHmrcPeriod(profile.hmrc, periodEnd);
      profile = saveCompanyProfile({ ...profile, hmrc });
      for (const file of files) removeCompanyEvidence(file.id);
      if (files.length) {
        const saved = await syncCompanyProfile(window.SPVCloud);
        if (saved.conflicts.length || getCompanyProfile()._cloudDirty) {
          throw new Error('Tax period was deleted locally, but document removal is pending sync. Retry company sync before removing stored files.');
        }
        for (const file of files) await deleteComplianceEvidence(profile.id, file);
      }
      renderProfile();
      await syncAfterSave();
      setEvidenceMessage('Tax period and its records deleted.');
    } catch (error) {
      setEvidenceMessage(error.message || 'Unable to delete the tax period.', true);
    }
    return;
  }
  const reveal = event.target.closest('[data-hmrc-reveal-ref]');
  if (reveal) {
    const periodEnd = reveal.dataset.hmrcRevealRef;
    const value = hmrcPeriodSummary(profile.hmrc, periodEnd).paymentReference;
    const target = [...$('hmrcPeriodHistory').querySelectorAll('[data-hmrc-ref-value]')].find((element) => element.dataset.hmrcRefValue === periodEnd);
    if (!target || !value) return;
    const showing = reveal.textContent === 'Hide';
    target.textContent = showing ? hmrcDisplayReference(value) : value;
    reveal.textContent = showing ? 'Show' : 'Hide';
    reveal.setAttribute('aria-label', (showing ? 'Show' : 'Hide') + ' payment reference for period ending ' + formatComplianceDateUK(periodEnd));
    return;
  }
  const attach = event.target.closest('[data-hmrc-attach]');
  if (attach && editingAllowed) {
    $('hmrcEvidenceInput').dataset.evidenceUpload = attach.dataset.hmrcAttach;
    $('hmrcEvidenceInput').value = '';
    $('hmrcEvidenceMessage').textContent = '';
    hmrcDialogs.evidence.open(attach);
    return;
  }
  const editPayment = event.target.closest('[data-hmrc-payment-edit]');
  if (editPayment && editingAllowed) {
    const periodEnd = editPayment.dataset.hmrcPaymentPeriod;
    const paymentId = editPayment.dataset.hmrcPaymentEdit;
    const payment = hmrcPeriodSummary(profile.hmrc, periodEnd).payments.find((item) => item.id === paymentId);
    if (!payment) return;
    hmrcPaymentEditingId = payment.id;
    hmrcPaymentIsNew = false;
    $('hmrcPaymentDialogTitle').textContent = 'Edit tax payment';
    $('hmrcPaymentSaveBtn').textContent = 'Save changes';
    $('hmrcPaymentPeriod').value = periodEnd;
    $('hmrcPaymentPeriod').disabled = true;
    $('hmrcPaymentDate').value = payment.date;
    $('hmrcPaymentAmount').value = String(payment.amount);
    $('hmrcPaymentReference').value = payment.reference || '';
    $('hmrcPaymentMethod').value = payment.method || 'other';
    $('hmrcPaymentConfirmed').checked = payment.status === 'hmrc-confirmed';
    $('hmrcPaymentMessage').textContent = '';
    $('hmrcPaymentEvidenceMessage').textContent = '';
    $('hmrcPaymentEvidenceInput').value = '';
    $('hmrcPaymentEvidenceSelection').textContent = 'No receipt selected';
    renderHmrcPaymentEvidence(periodEnd, payment.id);
    hmrcDialogs.payment.open(editPayment);
    return;
  }
  const action = event.target.closest('[data-hmrc-open][data-hmrc-period]');
  if (action && editingAllowed) {
    const periodEnd = action.dataset.hmrcPeriod;
    const isFiling = action.dataset.hmrcOpen === 'filing';
    if (!hmrcTaxPeriods(profile.hmrc).some((period) => period.periodEnd === periodEnd)) return;
    const select = $(isFiling ? 'hmrcRecordPeriod' : 'hmrcPaymentPeriod');
    select.value = periodEnd;
    if (isFiling) {
      fillHmrcFilingForm(periodEnd);
      renderHmrcFilingEvidence(periodEnd);
      $('hmrcFilingMessage').textContent = '';
      hmrcDialogs.filing.open(action);
    } else {
      hmrcPaymentEditingId = globalThis.crypto?.randomUUID?.() || 'payment-' + Date.now();
      hmrcPaymentIsNew = true;
      $('hmrcPaymentDialogTitle').textContent = 'Record tax payment';
      $('hmrcPaymentSaveBtn').textContent = 'Save payment';
      $('hmrcPaymentPeriod').disabled = false;
      $('hmrcPaymentDate').value = '';
      $('hmrcPaymentAmount').value = '';
      $('hmrcPaymentReference').value = '';
      $('hmrcPaymentMethod').value = 'bank-transfer';
      $('hmrcPaymentConfirmed').checked = false;
      $('hmrcPaymentMessage').textContent = '';
      $('hmrcPaymentEvidenceMessage').textContent = '';
      $('hmrcPaymentEvidenceInput').value = '';
      $('hmrcPaymentEvidenceSelection').textContent = 'No receipt selected';
      renderHmrcPaymentEvidence(periodEnd, hmrcPaymentEditingId);
      hmrcDialogs.payment.open(action);
    }
    return;
  }
  const button = event.target.closest('[data-hmrc-payment-remove]');
  if (!button || !editingAllowed) return;
  const periodEnd = button.dataset.hmrcPaymentPeriod;
  const paymentId = button.dataset.hmrcPaymentRemove;
  const ruleKey = hmrcPaymentEvidenceRuleKey(periodEnd, paymentId);
  const receiptFiles = (profile.complianceEvidence || []).filter((file) => file.ruleKey === ruleKey);
  const receiptNote = receiptFiles.length ? ' and its ' + receiptFiles.length + ' attached receipt' + (receiptFiles.length === 1 ? '' : 's') : '';
  if (!window.confirm('Delete this recorded Corporation Tax payment' + receiptNote + '?')) return;
  try {
    if (receiptFiles.length) {
      await requireEvidenceEditor();
      const before = await syncCompanyProfile(window.SPVCloud);
      if (before.conflicts.length || getCompanyProfile()._cloudDirty) throw new Error('Resolve company sync before deleting payment receipts.');
      profile = getCompanyProfile();
    }
    const currentFiles = (profile.complianceEvidence || []).filter((file) => file.ruleKey === ruleKey);
    const hmrc = removeHmrcPayment(profile.hmrc, periodEnd, paymentId);
    profile = saveCompanyProfile({ ...profile, hmrc });
    for (const file of currentFiles) removeCompanyEvidence(file.id);
    if (currentFiles.length) {
      const saved = await syncCompanyProfile(window.SPVCloud);
      if (saved.conflicts.length || getCompanyProfile()._cloudDirty) {
        throw new Error('Payment was deleted, but receipt detachment is pending sync. Retry company sync before deleting stored receipt files.');
      }
      for (const file of currentFiles) await deleteComplianceEvidence(profile.id, file);
    }
    renderProfile();
    await syncAfterSave();
  } catch (error) {
    $('companyEvidenceStatus').textContent = error.message || 'Unable to delete payment.';
    $('companyEvidenceStatus').classList.add('is-error');
  }
});

$('suggestNextHmrcPeriod').addEventListener('click', () => {
  const periods = hmrcTaxPeriods(profile.hmrc);
  const mostRecent = periods.at(-1);
  const start = mostRecent ? addMonthsClamped(mostRecent.periodEnd, 0, 1) : '';
  if (!start) {
    $('hmrcPeriodMessage').textContent = 'Record a confirmed tax period before preparing the next one.';
    return;
  }
  $('hmrcTaxStatus').value = 'active';
  $('hmrcPeriodStart').value = start;
  // A twelve-month period ends on the day before the next anniversary.
  $('hmrcPeriodEnd').value = addMonthsClamped(start, 12, -1);
  $('hmrcPeriodMessage').textContent = 'Suggested dates only. Confirm the new period with HMRC or your accountant before saving.';
});

$('hmrcPeriodForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editingAllowed) return;
  const status = $('hmrcTaxStatus').value;
  const periodStart = $('hmrcPeriodStart').value;
  const periodEnd = $('hmrcPeriodEnd').value;
  const message = $('hmrcPeriodMessage');
  const period = { status: 'active', periodStart, periodEnd };
  const existing = hmrcTaxPeriods(profile.hmrc);
  if (status === 'active' && !Object.keys(hmrcDeadlines(period)).length) {
    message.textContent = 'Enter an HMRC tax period no longer than 12 months.';
    return;
  }
  if (status === 'active' && existing.some((p) =>
      p.periodEnd !== periodEnd && periodStart <= p.periodEnd && periodEnd >= p.periodStart)) {
    message.textContent = 'Tax periods must not overlap. Check dates against your HMRC account.';
    return;
  }
  try {
    const periods = status === 'active'
      ? [...existing.filter((p) => p.periodEnd !== periodEnd), period]
      : existing;
    profile = saveCompanyProfile({ ...profile, hmrc: {
      ...profile.hmrc, status, periodStart: '', periodEnd: '', periods
    } });
    hmrcGuideSelected = '';
    renderProfile();
    $('hmrcPeriodStart').value = '';
    $('hmrcPeriodEnd').value = '';
    renderHmrcDashboard();
    hmrcDialogs.period.close();
    await syncAfterSave();
  } catch (error) {
    message.textContent = error.message || 'Unable to save HMRC details.';
  }
});

$('companyComplianceDialogClose').addEventListener('click', () => $('companyComplianceDialog').close());
$('companyComplianceDialog').addEventListener('close', () => {
  const key = companyComplianceDialogTriggerKey;
  if (!key) return;
  const pointerActivation = companyComplianceDialogOpenedByPointer;
  window.requestAnimationFrame(() => {
    const trigger = [...document.querySelectorAll('[data-open-company-compliance]')]
      .find((element) => element.dataset.openCompanyCompliance === key && element.getClientRects().length);
    trigger?.focus({ preventScroll: true });
    if (pointerActivation) trigger?.blur();
    companyComplianceDialogTriggerKey = '';
    companyComplianceDialogOpenedByPointer = false;
  });
});
$('complianceTabPanel').addEventListener('click', async (event) => {
  const openDetails = event.target.closest('[data-open-company-compliance]');
  if (openDetails) {
    companyComplianceDialogTriggerKey = openDetails.dataset.openCompanyCompliance;
    companyComplianceDialogOpenedByPointer = event.detail > 0;
    renderCompanyComplianceDialog(companyComplianceDialogTriggerKey);
    return;
  }
  const button = event.target.closest('[data-compliance-key]');
  if (!button || !editingAllowed) return;
  const key = button.dataset.complianceKey;
  const current = buildCompanyCompliance({
    today: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
    confirmations: profile.complianceConfirmations, hmrc: profile.hmrc, enabledConditional: profile.hmrc?.status === 'active' ? ['corporation-tax-payment'] : []
  }).find((item) => item.key === key);
  if (!current || current.source === 'companies-house') return;
  const alreadyConfirmed = current.status === 'user-confirmed';
  try {
    profile = saveComplianceConfirmation(key, !alreadyConfirmed,
      new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
    renderProfile();
    await syncAfterSave();
    renderCompanyComplianceDialog(key, false);
  } catch (error) {
    setSyncStatus(error.message || 'Could not save confirmation', 'error');
  }
});

$('companySearchBtn').addEventListener('click', searchCompanyParticulars);
$('companySearchInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    searchCompanyParticulars();
  }
});
$('companySearchResults').addEventListener('click', (event) => {
  const button = event.target.closest('[data-company-lookup]');
  if (button) selectCompanyParticulars(button.dataset.companyLookup);
});

$('companyDetailsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editingAllowed) return;
  const originalNumber = String(profile.companyNumber || '').trim().toUpperCase();
  const enteredNumber = $('companyNumberInput').value.trim().toUpperCase();
  if (enteredNumber && listStoredCompanyProfiles().some((item) =>
    item.id !== profile.id && item.companyNumber.trim().toUpperCase() === enteredNumber)) {
    companyDetailsError('This company number is already recorded in another company card.');
    return;
  }

  if (originalNumber && enteredNumber && enteredNumber !== originalNumber &&
      (profile.appointments.length || profile.investments.length || Object.keys(profile.complianceConfirmations).length)) {
    companyDetailsError('A different registration number may belong to another company. Use Add new company to keep existing records separate.');
    return;
  }
  try {
    profile = saveCompanyProfile({
      ...profile,
      companyName: $('companyNameInput').value,
      companyNumber: $('companyNumberInput').value,
      registeredOffice: $('companyOfficeInput').value,
      companyStatus: $('companyStatusInput').value,
      incorporationDate: $('companyDateInput').value
    });
    renderProfile();
    detailsDialog.close();
    await syncAfterSave();
    if (profile.companyNumber) await refreshCompanyHouseDeadlines();
  } catch (error) {
    companyDetailsError(error.message || 'Company details could not be saved.');
  }
});

$('appointmentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editingAllowed) return;
  const roles = [...document.querySelectorAll('[data-appointment-role]:checked')].map((checkbox) => checkbox.value);
  try {
    profile = saveAppointment({ id: $('appointmentIdInput').value, name: $('appointmentNameInput').value, roles });
    renderProfile();
    appointmentDialog.close();
    await syncAfterSave();
  } catch (error) {
    $('appointmentMessage').textContent = error.message || 'This person could not be saved.';
  }
});


$('investmentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editingAllowed) return;
  try {
    profile = saveInvestment({
      id: $('investmentIdInput').value,
      memberId: $('investmentMemberInput').value,
      amount: $('investmentAmountInput').value,
      date: $('investmentDateInput').value,
      reference: $('investmentReferenceInput').value
    });
    renderProfile();
    investmentDialog.close();
    await syncAfterSave();
  } catch (error) {
    $('investmentMessage').textContent = error.message || 'This investment could not be saved.';
  }
});

$('deleteInvestmentBtn').addEventListener('click', async () => {
  if (!editingAllowed) return;
  const id = $('investmentIdInput').value;
  const investment = profile.investments.find((item) => item.id === id);
  if (!investment || !window.confirm(`Remove this ${CURRENCY_FORMAT.format(investment.amount)} investment entry?`)) return;
  deleteInvestment(id);
  renderProfile();
  investmentDialog.close();
  await syncAfterSave();
});

$('deleteAppointmentBtn').addEventListener('click', async () => {
  if (!editingAllowed) return;
  const id = $('appointmentIdInput').value;
  const appointment = profile.appointments.find((item) => item.id === id);
  if (!appointment || !window.confirm(`Remove ${appointment.name} from the company appointments?`)) return;
  deleteAppointment(id);
  renderProfile();
  appointmentDialog.close();
  await syncAfterSave();
});

window.addEventListener('spv-workspace-synced', () => {
  renderProfile();
  if (!profile._cloudDirty) setSyncStatus('Company details synced', 'synced');
});
window.addEventListener('online', async () => {
  if (profile._cloudDirty) await syncAfterSave();
});

async function initialiseCompanyPage() {
  if (!currentCompanyId || !profile.companyName || profile.deletedAt) {
    window.location.replace(new URL('./company/', document.baseURI).href);
    return;
  }
  renderProfile();
  try {
    const state = await window.SPVCloud?.init?.();
    if (!state?.user) return;
    const access = await window.SPVCloud.getWorkspaceAccess();
    deleteAllowed = Boolean(access?.active && ['admin', 'editor'].includes(access.role));
    if (!access?.active || access.role === 'viewer') {
      editingAllowed = false;
      $('companySyncStatus').textContent = 'View-only · ask a workspace editor to make changes';
      $('companySyncStatus').classList.remove('error', 'synced');
      renderProfile();
    }
    await syncCompanyProfile(window.SPVCloud);
    if (getCompanyProfile().deletedAt) {
      window.location.replace(new URL('./company/', document.baseURI).href);
      return;
    }
    renderProfile();
    await refreshCompanyHouseDeadlines();
  } catch (error) {
    if (navigator.onLine) console.warn('Company access could not be verified:', error);
  }
}

initialiseCompanyPage();
