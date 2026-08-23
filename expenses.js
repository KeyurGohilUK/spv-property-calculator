import { getActiveProperties } from './storage.js';
import { renderSyncStatus } from './sync-status.js';
import {
  uploadCloudReceipt,
  downloadCloudReceipt,
  deleteCloudReceipt
} from './receipt-cloud.js';
import { getExpenses, getAllExpenses, replaceExpenses, saveExpense, deleteExpense, permanentlyRemoveLocalExpense, saveReceipt, getReceipt, deleteReceipt } from './expense-storage.js';
import { syncExpenseWorkspace } from './expense-cloud-sync.js';

const $ = (id) => document.getElementById(id);
const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const allowedReceiptTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MAX_RECEIPT_SIZE = 2 * 1024 * 1024;
const TARGET_RECEIPT_SIZE = Math.floor(1.5 * 1024 * 1024);
const MAX_RECEIPT_IMAGE_DIMENSION = 2000;
let properties = [];
let expenses = [];
let cloudUser = null;
let expenseSyncing = false;
let cloudListenerAttached = false;
let editingExpenseId = null;


function formatFileSize(bytes) {
  const size = Math.max(0, Number(bytes) || 0);
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not optimise this receipt image.')), type, quality);
  });
}

async function loadReceiptImage(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {}
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function optimiseReceiptImage(file) {
  if (!file || file.type === 'application/pdf' || file.size <= TARGET_RECEIPT_SIZE) return file;
  const source = await loadReceiptImage(file);
  const sourceWidth = source.width || source.naturalWidth;
  const sourceHeight = source.height || source.naturalHeight;
  if (!sourceWidth || !sourceHeight) throw new Error('Could not read this receipt image.');

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Image optimisation is not supported on this device.');

  let maximumDimension = MAX_RECEIPT_IMAGE_DIMENSION;
  let quality = 0.86;
  let result = null;
  try {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const scale = Math.min(1, maximumDimension / Math.max(sourceWidth, sourceHeight));
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      result = await canvasToBlob(canvas, 'image/jpeg', quality);
      if (result.size <= TARGET_RECEIPT_SIZE) break;
      if (quality > 0.58) quality -= 0.08;
      else {
        maximumDimension = Math.max(1000, Math.round(maximumDimension * 0.82));
        quality = 0.78;
      }
    }
  } finally {
    if (typeof source.close === 'function') source.close();
  }

  if (!result || result.size > MAX_RECEIPT_SIZE) {
    throw new Error('This image could not be reduced below 2 MB. Try retaking it closer to the receipt.');
  }
  const name = file.name.replace(/\.[^.]+$/, '') || 'receipt';
  return new File([result], `${name}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

function asTime(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function setSyncStatus(message, state = '') {
  renderSyncStatus($('expenseSyncStatus'), message, state);
}

async function syncExpenses({ showFeedback = true } = {}) {
  const cloud = window.SPVCloud;
  if (!cloud || !cloudUser || !navigator.onLine) {
    if (!cloudUser) setSyncStatus('Saved on this device · sign in from Properties to sync');
    else if (!navigator.onLine) setSyncStatus('Offline · changes will sync later');
    return;
  }

  expenseSyncing = true;
  setSyncStatus('Syncing expenses…');
  try {
    const result = await syncExpenseWorkspace(cloud);
    expenses = getExpenses();
    render();
    if (result.conflicts.length) {
      setSyncStatus(`${result.conflicts.length} expense conflict${result.conflicts.length === 1 ? '' : 's'} kept locally · review before retrying`, 'error');
    } else {
      setSyncStatus(showFeedback ? 'Expenses synced' : 'Synced', 'synced');
    }
  } catch (error) {
    console.warn('Expense sync failed:', error);
    const stage = error?.syncStage ? ` while ${error.syncStage}` : '';
    setSyncStatus(`Expense sync pending${stage} · local changes are safe`, 'error');
  } finally {
    expenseSyncing = false;
  }
}
async function setupExpenseCloud() {
  const cloud = window.SPVCloud;
  if (!cloud) {
    setSyncStatus('Saved on this device · cloud unavailable');
    return;
  }
  if (!cloudListenerAttached) {
    cloud.onAuthChange((user) => {
      window.setTimeout(() => {
        cloudUser = user || null;
        if (cloudUser && navigator.onLine) syncExpenses({ showFeedback: false });
        else setSyncStatus(cloudUser ? 'Offline · changes will sync later' : 'Saved on this device · sign in from Properties to sync');
      }, 0);
    });
    cloudListenerAttached = true;
  }
  try {
    const state = await cloud.init();
    cloudUser = state.user || null;
    if (cloudUser && navigator.onLine) await syncExpenses({ showFeedback: false });
    else setSyncStatus(cloudUser ? 'Offline · changes will sync later' : 'Saved on this device · sign in from Properties to sync');
  } catch (error) {
    console.warn('Expense cloud setup failed:', error);
    setSyncStatus('Saved locally · cloud setup failed', 'error');
  }
}

function money(value) { return currency.format(Number(value) || 0); }
function propertyName(id) { return properties.find((item) => item.id === id)?.title || 'Unknown property'; }
function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function populateProperties() {
  properties = getActiveProperties();
  const propertySelect = $('expenseProperty');
  propertySelect.innerHTML = '<option value="">Select property</option>';
  const filter = $('expenseFilter');
  Array.from(filter.options).slice(2).forEach((option) => option.remove());
  properties.forEach((property) => {
    const option = document.createElement('option');
    option.value = property.id;
    option.textContent = property.title || 'Untitled property';
    propertySelect.appendChild(option);
    const filterOption = option.cloneNode(true);
    filterOption.value = `property:${property.id}`;
    filter.appendChild(filterOption);
  });
}

function updateScope() {
  const propertyScope = $('expenseScope').value === 'property';
  $('expensePropertyField').classList.toggle('hidden', !propertyScope);
  $('expenseProperty').required = propertyScope;
  if (!propertyScope) {
    $('expenseProperty').value = '';
    $('expensePropertyError').classList.add('hidden');
  }
}

function openForm(expense = null) {
  editingExpenseId = expense?.id || null;
  $('expenseForm').reset();
  $('expenseDialogTitle').textContent = expense ? 'Edit Expense' : 'Add Expense';
  $('saveExpenseBtn').textContent = expense ? 'Save Changes' : 'Save Expense';
  $('expenseDate').value = expense?.date || today();
  $('expenseAmount').value = expense?.amount || '';
  $('expenseCategory').value = expense?.category || $('expenseCategory').options[0].value;
  $('expenseScope').value = expense?.scope || 'company';
  $('expenseProperty').value = expense?.propertyId || '';
  $('expenseDescription').value = expense?.description || '';
  $('expenseNotes').value = expense?.notes || '';
  $('removeExpenseReceipt').checked = false;
  $('removeReceiptField').classList.toggle('hidden', !expense?.receipt);
  $('expenseSaveMessage').textContent = '';
  $('expenseAmountError').classList.add('hidden');
  $('expensePropertyError').classList.add('hidden');
  $('expenseReceiptError').classList.add('hidden');
  $('expenseReceiptSize').textContent = expense?.receipt
    ? `Current receipt: ${expense.receipt.name || 'Receipt'} · ${formatFileSize(expense.receipt.size)}`
    : 'No receipt selected';
  updateScope();
  $('expenseDialog').showModal();
  window.setTimeout(() => $('expenseAmount').focus(), 0);
}

function closeForm() {
  editingExpenseId = null;
  $('expenseDialog').close();
}

function expenseMatchesFilter(expense) {
  const filter = $('expenseFilter').value;
  if (filter === 'company' && expense.scope !== 'company') return false;
  if (filter.startsWith('property:') && !(expense.scope === 'property' && expense.propertyId === filter.slice(9))) return false;
  const category = $('expenseCategoryFilter').value;
  if (category !== 'all' && expense.category !== category) return false;
  const from = $('expenseDateFrom').value;
  const to = $('expenseDateTo').value;
  if (from && String(expense.date || '') < from) return false;
  if (to && String(expense.date || '') > to) return false;
  return true;
}


function renderBreakdown(containerId, items, labelFor) {
  const container = $(containerId);
  container.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('span');
    empty.className = 'expense-breakdown-empty';
    empty.textContent = 'No matching expenses';
    container.appendChild(empty);
    return;
  }
  const totals = new Map();
  items.forEach((item) => {
    const label = labelFor(item);
    totals.set(label, (totals.get(label) || 0) + Number(item.amount || 0));
  });
  [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([label, total]) => {
      const row = document.createElement('div');
      row.className = 'expense-breakdown-row';
      const name = document.createElement('span');
      name.textContent = label;
      const value = document.createElement('strong');
      value.textContent = money(total);
      row.append(name, value);
      container.appendChild(row);
    });
}

function renderReports(items) {
  renderBreakdown('expenseMonthlyReport', items, (item) => {
    const match = /^(\d{4})-(\d{2})/.exec(String(item.date || ''));
    if (!match) return 'Unknown month';
    return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' })
      .format(new Date(Number(match[1]), Number(match[2]) - 1, 1));
  });
  renderBreakdown('expenseCategoryReport', items, (item) => item.category || 'Other');
  renderBreakdown('expenseAllocationReport', items, (item) =>
    item.scope === 'property' ? propertyName(item.propertyId) : 'General company'
  );
  $('exportExpensesBtn').disabled = items.length === 0;
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function exportFilteredExpenses() {
  const items = getExpenses().filter(expenseMatchesFilter);
  if (!items.length) return;
  const header = ['Date', 'Amount GBP', 'Category', 'Allocation', 'Property', 'Description', 'Notes', 'Receipt file', 'Cloud sync'];
  const rows = items.map((item) => [
    item.date,
    Number(item.amount || 0).toFixed(2),
    item.category || '',
    item.scope === 'property' ? 'Specific property' : 'General company',
    item.scope === 'property' ? propertyName(item.propertyId) : '',
    item.description || '',
    item.notes || '',
    item.receipt?.name || '',
    item._cloudDirty ? 'Pending' : 'Synced'
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `spv-expenses-${today()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function render() {
  expenses = getExpenses();
  const companyTotal = expenses.filter((item) => item.scope === 'company').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const propertyTotal = expenses.filter((item) => item.scope === 'property').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  $('totalExpenses').textContent = money(companyTotal + propertyTotal);
  $('companyExpenses').textContent = money(companyTotal);
  $('propertyExpenses').textContent = money(propertyTotal);

  const visible = expenses.filter(expenseMatchesFilter);
  renderReports(visible);
  $('expenseCount').textContent = String(visible.length);
  $('expenseEmpty').classList.toggle('hidden', visible.length > 0);
  const list = $('expenseList');
  list.innerHTML = '';

  visible.forEach((expense) => {
    const card = document.createElement('article');
    card.className = 'expense-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Edit expense ${expense.description || money(expense.amount)}`);
    card.addEventListener('click', () => openForm(expense));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openForm(expense);
      }
    });
    const main = document.createElement('div');
    main.className = 'expense-card-main';
    const heading = document.createElement('div');
    heading.className = 'expense-card-heading';
    const amount = document.createElement('strong');
    amount.textContent = money(expense.amount);
    const date = document.createElement('span');
    const parsedDate = new Date(`${expense.date}T12:00:00`);
    date.textContent = Number.isNaN(parsedDate.getTime()) ? expense.date : dateFormat.format(parsedDate);
    heading.append(amount, date);
    main.appendChild(heading);

    if (expense.description) {
      const description = document.createElement('p');
      description.className = 'expense-card-description';
      description.textContent = expense.description;
      main.appendChild(description);
    }

    const meta = document.createElement('div');
    meta.className = 'expense-card-meta';
    const category = document.createElement('span');
    category.className = 'expense-chip';
    category.textContent = expense.category || 'Other';
    const scope = document.createElement('span');
    scope.className = `expense-chip ${expense.scope === 'property' ? 'property' : ''}`;
    scope.textContent = expense.scope === 'property' ? propertyName(expense.propertyId) : 'General company';
    meta.append(category, scope);
    if (expense.receipt) {
      const receipt = document.createElement('span');
      receipt.className = 'expense-chip';
      receipt.textContent = expense.receiptObjectPath && !expense.receiptCloudPending
        ? 'Receipt synced'
        : 'Receipt saved locally';
      meta.appendChild(receipt);
    }
    main.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'expense-card-actions';
    actions.addEventListener('click', (event) => event.stopPropagation());
    actions.addEventListener('keydown', (event) => event.stopPropagation());
    if (expense.receipt) {
      const view = document.createElement('button');
      view.type = 'button';
      view.className = 'view-receipt';
      view.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6V3Z"></path><path d="M14 3v4h4"></path><path d="M9 12h6M9 16h6"></path></svg>';
      view.setAttribute('aria-label', `View receipt for ${expense.description || money(expense.amount)}`);
      view.title = 'View receipt';
      view.addEventListener('click', () => viewReceipt(expense));
      actions.appendChild(view);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete-expense';
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="m6.5 7 .8 13h9.4l.8-13"></path><path d="M10 11v5M14 11v5"></path></svg>';
    remove.setAttribute('aria-label', `Delete expense ${expense.description || money(expense.amount)}`);
    remove.title = 'Delete expense';
    remove.addEventListener('click', () => removeExpense(expense));
    actions.appendChild(remove);
    card.append(main, actions);
    list.appendChild(card);
  });
}

async function viewReceipt(expense) {
  const viewer = window.open('', '_blank');
  if (viewer) {
    viewer.document.title = 'Opening receipt…';
    viewer.document.body.textContent = 'Opening receipt…';
  }
  try {
    const expectedObjectPath = expense.receiptCloudPending ? '' : (expense.receiptObjectPath || '');
    let file = await getReceipt(expense.id, expectedObjectPath);
    if (!file && expense.receiptObjectPath && cloudUser && navigator.onLine) {
      file = await downloadCloudReceipt(expense.id, expense.receiptObjectPath, expense.receipt || {});
      await saveReceipt(expense.id, file, expense.receiptObjectPath);
    }
    if (!file) {
      throw new Error(expense.receiptObjectPath
        ? 'Connect to the internet and sign in to download this receipt.'
        : 'Receipt file is not available on this device.');
    }
    const url = URL.createObjectURL(file);
    if (viewer) viewer.location.replace(url);
    else window.location.assign(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  } catch (error) {
    if (viewer) viewer.close();
    window.alert(error.message || 'Could not open this receipt.');
  }
}

async function removeExpense(expense) {
  if (!window.confirm(`Delete this ${money(expense.amount)} expense? This cannot be undone.`)) return;
  if (deleteExpense(expense.id)) {
    try { await deleteReceipt(expense.id); } catch (error) { console.warn('Could not remove receipt file:', error); }
    if (expense.receiptObjectPath && cloudUser && navigator.onLine) {
      try { await deleteCloudReceipt(expense.id, expense.receiptObjectPath); }
      catch (error) { console.warn('Cloud receipt cleanup is pending:', error); }
    }
    render();
    syncExpenses({ showFeedback: false });
  }
}

async function submitExpense(event) {
  event.preventDefault();
  const amount = Number($('expenseAmount').value);
  const scope = $('expenseScope').value;
  const propertyId = $('expenseProperty').value;
  let receiptFile = $('expenseReceipt').files[0] || null;
  const amountInvalid = !Number.isFinite(amount) || amount <= 0;
  const propertyInvalid = scope === 'property' && !propertyId;
  $('expenseAmountError').classList.toggle('hidden', !amountInvalid);
  $('expensePropertyError').classList.toggle('hidden', !propertyInvalid);
  $('expenseReceiptError').classList.add('hidden');

  if (receiptFile && (!allowedReceiptTypes.has(receiptFile.type) || (receiptFile.type === 'application/pdf' && receiptFile.size > MAX_RECEIPT_SIZE))) {
    $('expenseReceiptError').textContent = receiptFile.type === 'application/pdf' && receiptFile.size > MAX_RECEIPT_SIZE
      ? 'PDF receipt must be 2 MB or smaller.'
      : 'Choose a PDF, JPEG, PNG, WebP or supported iPhone photo.';
    $('expenseReceiptError').classList.remove('hidden');
    return;
  }
  if (amountInvalid || propertyInvalid) return;

  const submit = $('expenseForm').querySelector('[type="submit"]');
  submit.disabled = true;
  $('expenseSaveMessage').textContent = 'Saving…';
  let saved = null;
  const previous = editingExpenseId ? getAllExpenses().find((item) => item.id === editingExpenseId) : null;
  const removeReceipt = Boolean(previous?.receipt && $('removeExpenseReceipt').checked);
  try {
    if (receiptFile?.type.startsWith('image/') && receiptFile.size > TARGET_RECEIPT_SIZE) {
      const originalSize = receiptFile.size;
      $('expenseSaveMessage').textContent = 'Optimising receipt…';
      receiptFile = await optimiseReceiptImage(receiptFile);
      $('expenseSaveMessage').textContent = `Receipt reduced from ${formatFileSize(originalSize)} to ${formatFileSize(receiptFile.size)}. Saving…`;
    }
    saved = saveExpense({
      ...previous,
      id: editingExpenseId || undefined,
      amount,
      date: $('expenseDate').value || today(),
      category: $('expenseCategory').value,
      scope,
      propertyId,
      description: $('expenseDescription').value.trim(),
      notes: $('expenseNotes').value.trim(),
      receipt: receiptFile
        ? { name: receiptFile.name, type: receiptFile.type, size: receiptFile.size }
        : (removeReceipt ? null : previous?.receipt || null),
      receiptObjectPath: receiptFile ? (previous?.receiptObjectPath || '') : (removeReceipt ? '' : previous?.receiptObjectPath || ''),
      receiptCloudPending: Boolean(receiptFile),
      receiptDeleteObjectPath: removeReceipt ? (previous?.receiptObjectPath || '') : ''
    });
    if (receiptFile) {
      await saveReceipt(saved.id, receiptFile);
      if (cloudUser && navigator.onLine) {
        $('expenseSaveMessage').textContent = 'Uploading receipt securely…';
        try {
          const uploaded = await uploadCloudReceipt(saved.id, receiptFile, previous?.receiptObjectPath || '');
          saved = saveExpense({
            ...saved,
            receipt: {
              ...saved.receipt,
              name: uploaded.name,
              type: uploaded.type,
              size: uploaded.size,
              uploadedAt: uploaded.uploadedAt
            },
            receiptObjectPath: uploaded.objectPath,
            receiptCloudPending: false,
            receiptDeleteObjectPath: ''
          });
          await saveReceipt(saved.id, receiptFile, uploaded.objectPath);
        } catch (error) {
          console.warn('Receipt saved locally; cloud upload will retry during sync:', error);
          setSyncStatus('Receipt saved locally · cloud upload pending', 'error');
        }
      }
    } else if (removeReceipt) {
      await deleteReceipt(saved.id);
      if (previous?.receiptObjectPath && cloudUser && navigator.onLine) {
        try {
          await deleteCloudReceipt(saved.id, previous.receiptObjectPath);
          saved = saveExpense({ ...saved, receiptDeleteObjectPath: '' });
        } catch (error) {
          console.warn('Cloud receipt removal will retry during sync:', error);
        }
      }
    }
    closeForm();
    render();
    syncExpenses({ showFeedback: false });
  } catch (error) {
    if (saved) {
      if (previous) {
        replaceExpenses(getAllExpenses().map((item) => item.id === previous.id ? previous : item));
      } else {
        permanentlyRemoveLocalExpense(saved.id);
        try { await deleteReceipt(saved.id); } catch {}
      }
    }
    $('expenseSaveMessage').textContent = error.message || 'Could not save this expense.';
  } finally {
    submit.disabled = false;
  }
}

$('openExpenseFormBtn').addEventListener('click', () => openForm());
$('closeExpenseDialogBtn').addEventListener('click', closeForm);
$('cancelExpenseBtn').addEventListener('click', closeForm);
$('expenseScope').addEventListener('change', updateScope);
function updateReceiptSelectionDetails() {
  const file = $('expenseReceipt').files[0] || null;
  const size = $('expenseReceiptSize');
  $('expenseReceiptError').classList.add('hidden');
  if (!file) {
    const current = editingExpenseId ? getAllExpenses().find((item) => item.id === editingExpenseId)?.receipt : null;
    size.textContent = current
      ? `Current receipt: ${current.name || 'Receipt'} · ${formatFileSize(current.size)}`
      : 'No receipt selected';
    return;
  }
  const willOptimise = file.type.startsWith('image/') && file.size > TARGET_RECEIPT_SIZE;
  size.textContent = `Selected: ${file.name} · ${formatFileSize(file.size)}${willOptimise ? ' · will be optimised when saved' : ''}`;
}
$('expenseReceipt').addEventListener('input', updateReceiptSelectionDetails);
$('expenseReceipt').addEventListener('change', updateReceiptSelectionDetails);
$('expenseFilter').addEventListener('change', render);
$('expenseCategoryFilter').addEventListener('change', render);
$('expenseDateFrom').addEventListener('change', render);
$('expenseDateTo').addEventListener('change', render);
$('toggleExpenseFiltersBtn').addEventListener('click', () => {
  const opening = $('expenseFilters').classList.contains('hidden');
  $('expenseFilters').classList.toggle('hidden', !opening);
  $('toggleExpenseFiltersBtn').setAttribute('aria-expanded', String(opening));
});
$('exportExpensesBtn').addEventListener('click', exportFilteredExpenses);
$('clearExpenseFiltersBtn').addEventListener('click', () => {
  $('expenseFilter').value = 'all';
  $('expenseCategoryFilter').value = 'all';
  $('expenseDateFrom').value = '';
  $('expenseDateTo').value = '';
  render();
});
$('expenseForm').addEventListener('submit', submitExpense);
window.addEventListener('online', () => syncExpenses({ showFeedback: false }));
window.addEventListener('offline', () => setSyncStatus('Offline · changes will sync later'));
window.addEventListener('spv-workspace-synced', () => {
  populateProperties();
  render();
});
$('expenseDialog').addEventListener('click', (event) => {
  const dialog = event.currentTarget;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeForm();
});

populateProperties();
Array.from($('expenseCategory').options).forEach((option) => {
  const filterOption = option.cloneNode(true);
  $('expenseCategoryFilter').appendChild(filterOption);
});
$('expenseDate').value = today();
render();
setupExpenseCloud();
