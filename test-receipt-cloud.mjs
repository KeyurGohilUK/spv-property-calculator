import assert from 'node:assert/strict';

globalThis.window = {
  SPV_SUPABASE_CONFIG: { receiptWorkerUrl: 'https://worker.example/' },
  SPVCloud: { getSession: async () => ({ access_token: 'token-1' }) }
};
const calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  if (options.method === 'PUT') {
    return Response.json({
      objectPath: 'receipts/expense-1/object.jpg',
      name: 'receipt.jpg',
      type: 'image/jpeg',
      size: 3,
      uploadedAt: '2026-08-23T00:00:00.000Z'
    }, { status: 201 });
  }
  if (options.method === 'DELETE') return new Response(null, { status: 204 });
  return new Response(new Uint8Array([1, 2, 3]), {
    headers: { 'Content-Type': 'image/jpeg' }
  });
};

try {
  const {
    isCloudReceiptConfigured,
    uploadCloudReceipt,
    downloadCloudReceipt,
    deleteCloudReceipt,
    prepareExpenseReceiptForSync
  } = await import('./receipt-cloud.js');

  assert.equal(isCloudReceiptConfigured(), true);
  const file = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
  Object.defineProperty(file, 'name', { value: 'receipt.jpg' });

  const uploaded = await uploadCloudReceipt('expense-1', file);
  assert.equal(uploaded.objectPath, 'receipts/expense-1/object.jpg');
  assert.equal(calls[0].options.headers.get('Authorization'), 'Bearer token-1');

  const downloaded = await downloadCloudReceipt('expense-1', uploaded.objectPath, uploaded);
  assert.equal(downloaded.size, 3);
  assert.equal(downloaded.name, 'receipt.jpg');

  assert.equal(await deleteCloudReceipt('expense-1', uploaded.objectPath), true);

  const prepared = await prepareExpenseReceiptForSync({
    id: 'expense-1',
    receipt: { name: 'receipt.jpg', type: 'image/jpeg', size: 3 },
    receiptCloudPending: true,
    _cloudDirty: true
  }, async () => file);
  assert.equal(prepared.receiptObjectPath, 'receipts/expense-1/object.jpg');
  assert.equal(prepared.receiptCloudPending, false);
} finally {
  globalThis.fetch = originalFetch;
  delete globalThis.window;
}

console.log('Cloud receipt client checks passed.');
