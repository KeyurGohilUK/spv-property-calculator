import { getActiveProperties } from './storage.js';
import { getExpenses, getAllExpenses, replaceExpenses, saveExpense, deleteExpense, permanentlyRemoveLocalExpense, saveReceipt, getReceipt, deleteReceipt } from './expense-storage.js';

const $ = (id) => document.getElementById(id);
const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const allowedReceiptTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_RECEIPT_SIZE = 2 * 1024 * 1024;
let properties = [];
let expenses = [];
let cloudUser = null;
let expenseSyncing = false;
let cloudListenerAttached = false;
let editingExpenseId = null;


function asTime(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function setSyncStatus(message, state = '') {
  const status = $('expenseSyncStatus');
  status.textContent = message;
  status.classList.toggle('error', state === 'error');
  status.classList.toggle('synced', state === 'synced');
  $('syncExpensesBtn').classList.toggle('hidden', !cloudUser);
  $('syncExpensesBtn').disabled = expenseSyncing || !navigator.onLine;
}

function mergeExpenseSets(localItems, cloudItems) {
  const localMap = new Map(localItems.map((item) => [String(item.id), item]));
  const cloudMap = new Map(cloudItems.map((item) => [String(item.id), item]));
  const merged = new Map();
  const upload = [];
  const conflicts = [];

  for (const id of new Set([...localMap.keys(), ...cloudMap.keys()])) {
    const local = localMap.get(id);
    const cloud = cloudMap.get(id);
    if (local && !cloud) {
      merged.set(id, local);
      upload.push(local);
      continue;
    }
    if (!local && cloud) {
      merged.set(id, cloud);
      continue;
    }
    if (!local || !cloud) continue;

    const localRevision = Math.max(0, Number(local._cloudRevision) || 0);
    const cloudRevision = Math.max(0, Number(cloud._cloudRevision) || 0);
    if (local._cloudDirty) {
      merged.set(id, local);
      if (localRevision === cloudRevision) upload.push(local);
      else conflicts.push(id);
    } else if (cloudRevision > localRevision || asTime(cloud.updatedAt) > asTime(local.updatedAt)) {
      merged.set(id, cloud);
    } else if (asTime(local.updatedAt) > asTime(cloud.updatedAt)) {
      merged.set(id, local);
      upload.push(local);
    } else {
      merged.set(id, cloud);
    }
  }
  return { merged, upload, conflicts };
}

async function syncExpenses({ showFeedback = true } = {}) {
  const cloud = window.SPVCloud;
  if (!cloud || !cloudUser || expenseSyncing || !navigator.onLine) {
    if (!cloudUser) setSyncStatus('Saved on this device · sign in from Properties to sync');
    else if (!navigator.onLine) setSyncStatus('Offline · changes will sync later');
    return;
  }

  expenseSyncing = true;
  setSyncStatus('Syncing expenses…');
  try {
    const cloudItems = await cloud.listExpenses();
    const merge = mergeExpenseSets(getAllExpenses(), cloudItems);
    for (const item of merge.upload) {
      try {
        const synced = await cloud.upsertExpense(item);
        merge.merged.set(String(item.id), synced);
      } catch (error) {
        if (cloud.isExpenseConflict?.(error)) {
          merge.conflicts.push(String(item.id));
          continue;
        }
        throw error;
      }
    }
    replaceExpenses([...merge.merged.values()]);
    render();
    if (merge.conflicts.length) {
      setSyncStatus(`${merge.conflicts.length} expense conflict${merge.conflicts.length === 1 ? '' : 's'} kept locally · review before retrying`, 'error');
    } else {
      setSyncStatus(showFeedback ? 'Expenses synced' : 'Synced', 'synced');
    }
  } catch (error) {
    console.warn('Expense sync failed:', error);
    const missingSchema = error?.code === '42P01'
      || error?.code === 'PGRST202'
      || /expenses|upsert_expense_if_current/i.test(String(error?.message || ''));
    setSyncStatus(
      missingSchema ? 'Cloud setup required · run database Update 10' : 'Expense sync failed · local changes are safe',
      'error'
    );
  } finally {
    expenseSyncing = false;
    $('syncExpensesBtn').disabled = !navigator.onLine;
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
  if (filter === 'all') return true;
  if (filter === 'company') return expense.scope === 'company';
  if (filter.startsWith('property:') && !(expense.scope === 'property' && expense.propertyId === filter.slice(9))) return false;
  if (filter === 'company' && expense.scope !== 'company') return false;
  const category = $('expenseCategoryFilter').value;
  if (category !== 'all' && expense.category !== category) return false;
  const from = $('expenseDateFrom').value;
  const to = $('expenseDateTo').value;
  if (from && String(expense.date || '') < from) return false;
  if (to && String(expense.date || '') > to) return false;
  return true;
}

function render() {
  expenses = getExpenses();
  const companyTotal = expenses.filter((item) => item.scope === 'company').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const propertyTotal = expenses.filter((item) => item.scope === 'property').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  $('totalExpenses').textContent = money(companyTotal + propertyTotal);
  $('companyExpenses').textContent = money(companyTotal);
  $('propertyExpenses').textContent = money(propertyTotal);

  const visible = expenses.filter(expenseMatchesFilter);
  $('expenseCount').textContent = String(visible.length);
  $('expenseEmpty').classList.toggle('hidden', visible.length > 0);
  const list = $('expenseList');
  list.innerHTML = '';

  visible.forEach((expense) => {
    const card = document.createElement('article');
    card.className = 'expense-card';
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
      receipt.textContent = 'Receipt attached';
      meta.appendChild(receipt);
    }
    main.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'expense-card-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'edit-expense';
    edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.2-1 10.6-10.6a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z"></path><path d="m14.5 6.7 2.8 2.8"></path></svg>';
    edit.setAttribute('aria-label', `Edit expense ${expense.description || money(expense.amount)}`);
    edit.title = 'Edit expense';
    edit.addEventListener('click', () => openForm(expense));
    actions.appendChild(edit);
    if (expense.receipt) {
      const view = document.createElement('button');
      view.type = 'button';
      view.textContent = 'View';
      view.setAttribute('aria-label', `View receipt for ${expense.description || money(expense.amount)}`);
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
  try {
    const file = await getReceipt(expense.id);
    if (!file) throw new Error('Receipt file is not available on this device.');
    const url = URL.createObjectURL(file);
    window.open(url, '_blank', 'noopener');
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    window.alert(error.message || 'Could not open this receipt.');
  }
}

async function removeExpense(expense) {
  if (!window.confirm(`Delete this ${money(expense.amount)} expense? This cannot be undone.`)) return;
  if (deleteExpense(expense.id)) {
    try { await deleteReceipt(expense.id); } catch (error) { console.warn('Could not remove receipt file:', error); }
    render();
    syncExpenses({ showFeedback: false });
  }
}

async function submitExpense(event) {
  event.preventDefault();
  const amount = Number($('expenseAmount').value);
  const scope = $('expenseScope').value;
  const propertyId = $('expenseProperty').value;
  const receiptFile = $('expenseReceipt').files[0] || null;
  const amountInvalid = !Number.isFinite(amount) || amount <= 0;
  const propertyInvalid = scope === 'property' && !propertyId;
  $('expenseAmountError').classList.toggle('hidden', !amountInvalid);
  $('expensePropertyError').classList.toggle('hidden', !propertyInvalid);
  $('expenseReceiptError').classList.add('hidden');

  if (receiptFile && (!allowedReceiptTypes.has(receiptFile.type) || receiptFile.size > MAX_RECEIPT_SIZE)) {
    $('expenseReceiptError').textContent = receiptFile.size > MAX_RECEIPT_SIZE
      ? 'Receipt must be 2 MB or smaller.'
      : 'Choose a PDF, JPEG, PNG or WebP receipt.';
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
        : (removeReceipt ? null : previous?.receipt || null)
    });
    if (receiptFile) await saveReceipt(saved.id, receiptFile);
    else if (removeReceipt) await deleteReceipt(saved.id);
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
$('expenseFilter').addEventListener('change', render);
$('expenseCategoryFilter').addEventListener('change', render);
$('expenseDateFrom').addEventListener('change', render);
$('expenseDateTo').addEventListener('change', render);
$('toggleExpenseFiltersBtn').addEventListener('click', () => {
  const opening = $('expenseFilters').classList.contains('hidden');
  $('expenseFilters').classList.toggle('hidden', !opening);
  $('toggleExpenseFiltersBtn').setAttribute('aria-expanded', String(opening));
});
$('clearExpenseFiltersBtn').addEventListener('click', () => {
  $('expenseFilter').value = 'all';
  $('expenseCategoryFilter').value = 'all';
  $('expenseDateFrom').value = '';
  $('expenseDateTo').value = '';
  render();
});
$('expenseForm').addEventListener('submit', submitExpense);
$('syncExpensesBtn').addEventListener('click', () => syncExpenses({ showFeedback: true }));
window.addEventListener('online', () => syncExpenses({ showFeedback: false }));
window.addEventListener('offline', () => setSyncStatus('Offline · changes will sync later'));
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
