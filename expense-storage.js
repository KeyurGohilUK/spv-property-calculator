const EXPENSE_STORAGE_KEY = 'spv-property-calculator.expenses.v1';
const RECEIPT_DB_NAME = 'spv-property-calculator.receipts.v1';
const RECEIPT_STORE = 'receipts';

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `expense-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readRaw() {
  try {
    const parsed = JSON.parse(localStorage.getItem(EXPENSE_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Could not read expenses:', error);
    return [];
  }
}

function writeRaw(expenses) {
  try {
    localStorage.setItem(EXPENSE_STORAGE_KEY, JSON.stringify(expenses));
    return true;
  } catch (error) {
    console.error('Could not save expenses:', error);
    return false;
  }
}

export function getExpenses() {
  return readRaw().sort((a, b) => {
    const dateOrder = String(b.date || '').localeCompare(String(a.date || ''));
    return dateOrder || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });
}

export function saveExpense(expense) {
  const expenses = readRaw();
  const now = new Date().toISOString();
  const scope = expense.scope === 'property' ? 'property' : 'company';
  const record = {
    ...expense,
    id: expense.id || makeId(),
    amount: Math.max(0, Number(expense.amount) || 0),
    scope,
    propertyId: scope === 'property' ? String(expense.propertyId || '') : '',
    receipt: expense.receipt || null,
    createdAt: expense.createdAt || now,
    updatedAt: now
  };
  const index = expenses.findIndex((item) => item.id === record.id);
  if (index >= 0) expenses[index] = record;
  else expenses.push(record);
  if (!writeRaw(expenses)) throw new Error('Unable to save this expense. Your browser storage may be full.');
  return record;
}

export function deleteExpense(id) {
  const expenses = readRaw();
  const filtered = expenses.filter((item) => item.id !== id);
  return filtered.length !== expenses.length && writeRaw(filtered);
}

function openReceiptDb() {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('Receipt storage is not supported by this browser.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RECEIPT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(RECEIPT_STORE)) {
        request.result.createObjectStore(RECEIPT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open receipt storage.'));
  });
}

function receiptTransaction(mode, action) {
  return openReceiptDb().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(RECEIPT_STORE, mode);
    const store = transaction.objectStore(RECEIPT_STORE);
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Receipt storage failed.'));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error('Receipt storage failed.'));
    };
  }));
}

export function saveReceipt(expenseId, file) {
  return receiptTransaction('readwrite', (store) => store.put(file, expenseId));
}

export function getReceipt(expenseId) {
  return receiptTransaction('readonly', (store) => store.get(expenseId));
}

export function deleteReceipt(expenseId) {
  return receiptTransaction('readwrite', (store) => store.delete(expenseId));
}
