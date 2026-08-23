function serviceUrl() {
  return String(window.SPV_SUPABASE_CONFIG?.receiptWorkerUrl || '').replace(/\/$/, '');
}

async function accessToken() {
  const session = await window.SPVCloud?.getSession?.();
  if (!session?.access_token) throw new Error('Please sign in to sync receipts.');
  return session.access_token;
}

async function receiptRequest(path, options = {}) {
  const root = serviceUrl();
  if (!root) throw new Error('Cloud receipt storage is not configured.');
  const token = await accessToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', 'Bearer ' + token);
  const response = await fetch(root + path, { ...options, headers });
  if (!response.ok) {
    let message = '';
    try { message = (await response.json()).error || ''; } catch {}
    throw new Error(message || 'Cloud receipt request failed.');
  }
  return response;
}

export function isCloudReceiptConfigured() {
  return Boolean(serviceUrl());
}

export async function uploadCloudReceipt(expenseId, file, previousObjectPath = '') {
  const headers = {
    'Content-Type': file.type,
    'X-Receipt-Name': encodeURIComponent(file.name || 'receipt')
  };
  if (previousObjectPath) headers['X-Previous-Object-Key'] = previousObjectPath;
  const response = await receiptRequest('/receipts/' + encodeURIComponent(expenseId), {
    method: 'PUT',
    headers,
    body: file
  });
  return response.json();
}

export async function downloadCloudReceipt(expenseId, objectPath, metadata = {}) {
  const response = await receiptRequest(
    '/receipts/' + encodeURIComponent(expenseId) + '?key=' + encodeURIComponent(objectPath)
  );
  const blob = await response.blob();
  return new File([blob], metadata.name || 'receipt', {
    type: metadata.type || blob.type || 'application/octet-stream',
    lastModified: Date.now()
  });
}

export async function deleteCloudReceipt(expenseId, objectPath) {
  if (!objectPath) return true;
  await receiptRequest(
    '/receipts/' + encodeURIComponent(expenseId) + '?key=' + encodeURIComponent(objectPath),
    { method: 'DELETE' }
  );
  return true;
}

export async function prepareExpenseReceiptForSync(expense, readLocalReceipt) {
  let prepared = { ...expense };
  if (prepared.receiptDeleteObjectPath) {
    await deleteCloudReceipt(prepared.id, prepared.receiptDeleteObjectPath);
    prepared = { ...prepared, receiptDeleteObjectPath: '' };
  }
  if (!prepared.deletedAt && prepared.receipt && (!prepared.receiptObjectPath || prepared.receiptCloudPending)) {
    const file = await readLocalReceipt(prepared.id);
    if (!file) throw new Error('Receipt upload is pending, but the local file is unavailable on this device.');
    const uploaded = await uploadCloudReceipt(prepared.id, file, prepared.receiptObjectPath || '');
    prepared = {
      ...prepared,
      receipt: {
        ...prepared.receipt,
        name: uploaded.name,
        type: uploaded.type,
        size: uploaded.size,
        uploadedAt: uploaded.uploadedAt
      },
      receiptObjectPath: uploaded.objectPath,
      receiptCloudPending: false,
      receiptDeleteObjectPath: '',
      _cloudDirty: true
    };
  }
  return prepared;
}
