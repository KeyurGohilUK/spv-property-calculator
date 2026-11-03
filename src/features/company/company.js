import { setupDialog } from '../../components/dialog-helper.js';
import { buildCompanyCompliance, formatComplianceDateUK } from './compliance-rules.js';
import { escapeHtml, formatDate } from '../../utils/format-utils.js';
import { syncCompanyProfile } from './company-cloud-sync.js';
import {
  getCompanyProfile,
  setActiveCompanyId,
  listStoredCompanyProfiles,
  deleteCompanyProfile,
  saveCompanyProfile,
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

function renderAppointments() {
  const empty = profile.appointments.length === 0;
  $('companyAppointmentsEmpty').classList.toggle('hidden', !empty);
  $('companyAppointmentsTable').classList.toggle('hidden', empty);
  $('companyAppointmentCards').classList.toggle('hidden', empty);
  $('companyAppointmentsRows').innerHTML = profile.appointments.map((appointment) => `
    <tr>
      <th scope="row">${escapeHtml(appointment.name)}</th>
      <td>${roleMark(appointment, 'director')}</td>
      <td>${roleMark(appointment, 'shareholder')}</td>
      <td>${roleMark(appointment, 'secretary')}</td>
      <td>${roleMark(appointment, 'psc')}</td>
      <td><button class="secondary-btn compact-company-btn company-edit-icon-btn" type="button" aria-label="Edit appointment for ${escapeHtml(appointment.name)}" title="Edit appointment for ${escapeHtml(appointment.name)}" data-edit-appointment="${escapeHtml(appointment.id)}" ${editingAllowed ? '' : 'disabled'}>${EDIT_ICON}</button></td>
    </tr>`).join('');
  $('companyAppointmentCards').innerHTML = profile.appointments.map((appointment) => `
    <article class="company-appointment-card">
      <div class="company-appointment-card-heading"><h3>${escapeHtml(appointment.name)}</h3><button class="secondary-btn compact-company-btn company-edit-icon-btn" type="button" aria-label="Edit appointment for ${escapeHtml(appointment.name)}" title="Edit appointment for ${escapeHtml(appointment.name)}" data-edit-appointment="${escapeHtml(appointment.id)}" ${editingAllowed ? '' : 'disabled'}>${EDIT_ICON}</button></div>
      <ul class="company-role-chips">${appointment.roles.map((role) => `<li>${escapeHtml(ROLE_LABELS[role])}</li>`).join('')}</ul>
    </article>`).join('');
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
  const items = buildCompanyCompliance({ today, company: companyHouseData || {}, confirmations: profile.complianceConfirmations });
  $('companyComplianceSummary').textContent = profile.companyNumber
    ? `${items.filter((item) => item.source !== 'companies-house' && item.status === 'user-confirmed').length} manually confirmed · ${companyHouseData ? 'Companies House deadlines retrieved' : companyHouseError || 'deadlines not yet retrieved'}`
    : 'Add a company number in Particulars to associate this checklist with your SPV.';
  const peopleRoot = $('companyOfficialPeople');
  if (peopleRoot) {
    const people = companyHouseData?.officialPeople;
    const normalized = (name) => String(name || '').toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\\s+/).filter(Boolean).sort().join(' ');
    const internalDirectors = profile.appointments.filter((a) => a.roles.includes('director'));
    const officialDirectors = (people?.officers || []).filter((a) => a.role === 'director');
    const namesMatch = (name) => internalDirectors.some((a) => normalized(a.name) === normalized(name));
    const showDate = (date) => date ? formatComplianceDateUK(date) : '';
    const verification = (entry) => entry.verification?.statementStartOn
      ? `Appointment verification statement recorded ${escapeHtml(showDate(entry.verification.statementStartOn))}`
      : entry.verification?.verifiedOn
        ? `Identity verification date published: ${escapeHtml(showDate(entry.verification.verifiedOn))}`
        : 'Verification status not publicly confirmed';
    const renderPeople = (items, isDirector) => items.map((entry) => `<li><strong>${escapeHtml(entry.name)}</strong> · ${isDirector ? namesMatch(entry.name) ? 'Name matches internal director' : 'Review internal director record' : 'PSC on public register'}<small>${verification(entry)}${entry.verification?.statementDueOn ? ' · Statement due ' + escapeHtml(showDate(entry.verification.statementDueOn)) : ''}</small></li>`).join('');
    peopleRoot.innerHTML = !people
      ? '<p class="muted">Official people records unavailable until Companies House lookup completes.</p>'
      : `<p class="muted">Directors: ${people.officersAvailable ? 'Public register retrieved' : 'Unavailable'} · PSCs: ${people.pscsAvailable ? 'Public register retrieved' : 'Unavailable'}</p>
          ${people.officersAvailable ? `<h4>Current directors</h4><ul>${renderPeople(officialDirectors, true) || '<li>No current directors returned.</li>'}</ul>` : ''}
          ${people.pscsAvailable ? `<h4>Current PSCs</h4><ul>${renderPeople(people.pscs || [], false) || '<li>No PSC entries returned. Check for PSC statements.</li>'}</ul>` : ''}
          ${people.officersAvailable && officialDirectors.length !== internalDirectors.length ? '<p class="muted">Director counts differ between internal and official records. Check the names and appointment details.</p>' : ''}
          <p class="muted">Name matching is indicative only, not identity proof. Check the official register for discrepancies.</p>`;
  }
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
  $('companyComplianceItems').innerHTML = items.map((item) => `
    <article class="company-compliance-item">
      <div class="company-compliance-item-heading"><h3>${escapeHtml(item.title)}</h3>
        <span class="company-compliance-status">${item.status === 'user-confirmed' ? 'User confirmed' : item.status === 'due-soon' ? 'Due soon' : item.status === 'upcoming' ? 'Upcoming' : item.status === 'past-deadline-unverified' ? 'Past deadline · unverified' : 'Needs verification'}</span></div>
      ${item.dueDate ? `<p class="muted">Due ${escapeHtml(formatComplianceDateUK(item.dueDate))} · Companies House</p>` : ''}
      ${item.officialFiling?.lastPeriod ? `<p class="muted">Last filed period: ${escapeHtml(formatComplianceDateUK(item.officialFiling.lastPeriod))} · Companies House</p>` : item.source === 'companies-house' ? '<p class="muted">Last filing period not available</p>' : ''}
      ${item.reminder ? `<p class="company-compliance-reminder">Filing reminder: ${escapeHtml(item.reminder.message)} · ${item.reminder.windowDays}-day reminder window</p>` : ''}
      <p class="muted">${item.source === 'companies-house'
        ? companyHouseData ? 'Official public filing period and next deadline; upcoming filing is not marked complete.' : 'Official filing data unavailable; check Companies House.'
        : item.source === 'hmrc'
          ? 'Check your HMRC account or ask your accountant.'
          : 'Confirm this requirement and keep appropriate evidence.'}</p>
      ${item.source !== 'companies-house' ? `<button type="button" class="secondary-btn company-compliance-action" data-compliance-key="${escapeHtml(item.key)}" ${editingAllowed ? '' : 'disabled'}>${item.status === 'user-confirmed' ? 'Undo confirmation' : 'Mark as done'}</button>` : ''}
      ${item.confirmation ? `<small class="muted">Confirmed on ${escapeHtml(formatComplianceDateUK(item.confirmation.confirmedOn))}</small>` : ''}
    </article>`).join('');
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
}

async function refreshCompanyHouseDeadlines() {
  const companyNumber = String(profile.companyNumber || '').trim().toUpperCase();
  if (!companyNumber || !navigator.onLine || !window.SPVCloud?.getCompanyHouseDeadlines) return;
  if (lookupCompanyNumber !== companyNumber) companyHouseData = null;
  lookupCompanyNumber = companyNumber;
  companyHouseError = 'Checking Companies House…';
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
$('companyComplianceItems').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-compliance-key]');
  if (!button || !editingAllowed) return;
  const key = button.dataset.complianceKey;
  const current = buildCompanyCompliance({
    today: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
    confirmations: profile.complianceConfirmations
  }).find((item) => item.key === key);
  if (!current || current.source === 'companies-house') return;
  const alreadyConfirmed = current.status === 'user-confirmed';
  if (!alreadyConfirmed && !window.confirm('Confirm that you completed this requirement? This is your own record, not official verification.')) return;
  try {
    profile = saveComplianceConfirmation(key, !alreadyConfirmed,
      new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
    renderProfile();
    await syncAfterSave();
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
