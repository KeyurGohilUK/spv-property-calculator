import { getActiveProperties } from './storage.js';
import { getExpenses, saveExpense, deleteExpense, saveReceipt, getReceipt, deleteReceipt } from './expense-storage.js';

const $ = (id) => document.getElementById(id);
const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const allowedReceiptTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_RECEIPT_SIZE = 2 * 1024 * 1024;
let properties = [];
let expenses = [];

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

function openForm() {
  $('expenseForm').reset();
  $('expenseDate').value = today();
  $('expenseSaveMessage').textContent = '';
  $('expenseAmountError').classList.add('hidden');
  $('expensePropertyError').classList.add('hidden');
  $('expenseReceiptError').classList.add('hidden');
  updateScope();
  $('expenseDialog').showModal();
  window.setTimeout(() => $('expenseAmount').focus(), 0);
}

function closeForm() { $('expenseDialog').close(); }

function expenseMatchesFilter(expense) {
  const filter = $('expenseFilter').value;
  if (filter === 'all') return true;
  if (filter === 'company') return expense.scope === 'company';
  if (filter.startsWith('property:')) return expense.scope === 'property' && expense.propertyId === filter.slice(9);
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
  try {
    saved = saveExpense({
      amount,
      date: $('expenseDate').value || today(),
      category: $('expenseCategory').value,
      scope,
      propertyId,
      description: $('expenseDescription').value.trim(),
      notes: $('expenseNotes').value.trim(),
      receipt: receiptFile ? { name: receiptFile.name, type: receiptFile.type, size: receiptFile.size } : null
    });
    if (receiptFile) await saveReceipt(saved.id, receiptFile);
    closeForm();
    render();
  } catch (error) {
    if (saved) {
      deleteExpense(saved.id);
      try { await deleteReceipt(saved.id); } catch {}
    }
    $('expenseSaveMessage').textContent = error.message || 'Could not save this expense.';
  } finally {
    submit.disabled = false;
  }
}

$('openExpenseFormBtn').addEventListener('click', openForm);
$('closeExpenseDialogBtn').addEventListener('click', closeForm);
$('cancelExpenseBtn').addEventListener('click', closeForm);
$('expenseScope').addEventListener('change', updateScope);
$('expenseFilter').addEventListener('change', render);
$('expenseForm').addEventListener('submit', submitExpense);
$('expenseDialog').addEventListener('click', (event) => {
  const dialog = event.currentTarget;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeForm();
});

populateProperties();
$('expenseDate').value = today();
render();
