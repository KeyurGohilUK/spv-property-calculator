import { getIconSvg } from '../../components/shared-icons.js';

const SEARCH_ICON = getIconSvg('search');

/** Build the shared company particulars dialog with mode-specific copy and IDs. */
export function createCompanyProfileDialog(mode) {
  if (mode !== 'add' && mode !== 'edit') throw new TypeError('Company dialog mode must be "add" or "edit".');

  const add = mode === 'add';
  const ids = add ? {
    dialog: 'addCompanyDialog', form: 'addCompanyForm', title: 'addCompanyDialogTitle',
    close: 'closeAddCompanyDialog', cancel: 'cancelAddCompany', search: 'newCompanySearchInput',
    searchButton: 'newCompanySearchBtn', searchStatus: 'newCompanySearchStatus',
    results: 'newCompanySearchResults', name: 'newCompanyName', number: 'newCompanyNumber',
    office: 'newCompanyOffice', status: 'newCompanyStatus', date: 'newCompanyDate',
    message: 'addCompanyMessage'
  } : {
    dialog: 'companyDetailsDialog', form: 'companyDetailsForm', title: 'companyDetailsDialogTitle',
    close: 'closeCompanyDetailsDialog', cancel: 'cancelCompanyDetailsBtn', search: 'companySearchInput',
    searchButton: 'companySearchBtn', searchStatus: 'companySearchStatus', results: 'companySearchResults',
    name: 'companyNameInput', number: 'companyNumberInput', office: 'companyOfficeInput',
    status: 'companyStatusInput', date: 'companyDateInput', message: 'companyDetailsMessage'
  };

  const dialog = document.createElement('dialog');
  dialog.id = ids.dialog;
  dialog.className = 'app-dialog company-dialog';
  dialog.setAttribute('aria-labelledby', ids.title);
  dialog.innerHTML = `
    <form id="${ids.form}"${add ? '' : ' novalidate'}>
      <div class="company-dialog-header">
        <div>${add ? '' : '<p class="eyebrow">Company particulars</p>'}<h2 id="${ids.title}">${add ? 'Add company' : 'Edit company details'}</h2></div>
        <button id="${ids.close}" class="dialog-close" type="button" aria-label="Close ${add ? 'add company' : 'company details'}">×</button>
      </div>
      <div class="company-official-search">
        <label class="field"><span>Find company on Companies House</span><input id="${ids.search}" type="search" maxlength="100" autocomplete="off" placeholder="Company name or 8-character number"></label>
        <button id="${ids.searchButton}" class="secondary-btn company-search-icon-btn" type="button" aria-label="Search Companies House" title="Search Companies House">${SEARCH_ICON}</button>
        <p id="${ids.searchStatus}" class="muted" role="status" aria-live="polite"></p>
        <div id="${ids.results}" class="company-search-results" role="group" aria-label="Companies House search results"></div>
        <small class="muted">${add
    ? 'Select a result to populate the fields below, then review and add the company. You can also enter details manually.'
    : 'Select a result to populate the fields below; review and save to update the shared company record. Existing appointments are not changed.'}</small>
      </div>
      <label class="field"><span>Company name <strong aria-hidden="true">*</strong></span><input id="${ids.name}" type="text" maxlength="160" autocomplete="organization" required></label>
      <label class="field"><span>Company number</span><input id="${ids.number}" type="text" maxlength="32" autocomplete="off"${add ? '' : ' aria-describedby="companyNumberHelp"'}>${add ? '' : '<small id="companyNumberHelp">Enter manually, or select an official Companies House result above.</small>'}</label>
      <label class="field"><span>Registered office</span><textarea id="${ids.office}" rows="3" maxlength="500" autocomplete="street-address" data-plain-text></textarea></label>
      <div class="company-form-columns">
        <label class="field"><span>Company status</span><input id="${ids.status}" type="text" maxlength="80" placeholder="e.g. Active"></label>
        <label class="field"><span>Incorporation date</span><input id="${ids.date}" type="date"></label>
      </div>
      <p id="${ids.message}" class="save-message"${add ? ' role="status"' : ' aria-live="polite"'}></p>
      <div class="dialog-actions company-form-actions"><button id="${ids.cancel}" class="secondary-btn" type="button">Cancel</button><button class="primary-btn" type="submit">${add ? 'Add company' : 'Save'}</button></div>
    </form>`;
  document.body.append(dialog);
  return dialog;
}
