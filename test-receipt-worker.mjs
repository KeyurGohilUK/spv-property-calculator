import assert from 'node:assert/strict';
import worker from './cloudflare/receipt-worker/src/index.js';

const objects = new Map();
const bucket = {
  async put(key, value, options) {
    objects.set(key, {
      body: value,
      size: value.byteLength,
      httpMetadata: options.httpMetadata,
      customMetadata: options.customMetadata,
      writeHttpMetadata(headers) { headers.set('Content-Type', options.httpMetadata.contentType); }
    });
  },
  async get(key) { return objects.get(key) || null; },
  async delete(key) { objects.delete(key); }
};
const env = {
  RECEIPTS: bucket,
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
  ALLOWED_ORIGINS: 'https://keyurgohiluk.github.io'
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'user-1' });
  if (String(url).includes('/rest/v1/rpc/is_workspace_')) return Response.json(true);
  throw new Error('Unexpected request: ' + url);
};

try {
  const health = await worker.fetch(new Request('https://worker.example/health'), env);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);

  const blocked = await worker.fetch(new Request('https://worker.example/health', {
    headers: { Origin: 'https://attacker.example' }
  }), env);
  assert.equal(blocked.status, 403);

  const unauthorized = await worker.fetch(new Request('https://worker.example/receipts/expense-1', {
    method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: new Uint8Array([1])
  }), env);
  assert.equal(unauthorized.status, 401);

  const upload = await worker.fetch(new Request('https://worker.example/receipts/expense-1', {
    method: 'PUT',
    headers: {
      Origin: 'https://keyurgohiluk.github.io',
      Authorization: 'Bearer valid-token',
      'Content-Type': 'image/jpeg',
      'X-Receipt-Name': encodeURIComponent('receipt photo.jpg')
    },
    body: new Uint8Array([1, 2, 3])
  }), env);
  assert.equal(upload.status, 201);
  const metadata = await upload.json();
  assert.match(metadata.objectPath, /^receipts\/expense-1\/[A-Za-z0-9-]+\.jpg$/);
  assert.equal(metadata.size, 3);

  const download = await worker.fetch(new Request(
    'https://worker.example/receipts/expense-1?key=' + encodeURIComponent(metadata.objectPath),
    { headers: { Authorization: 'Bearer valid-token' } }
  ), env);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('Content-Type'), 'image/jpeg');
  assert.match(download.headers.get('Content-Disposition'), /receipt%20photo\.jpg/);

  const remove = await worker.fetch(new Request(
    'https://worker.example/receipts/expense-1?key=' + encodeURIComponent(metadata.objectPath),
    { method: 'DELETE', headers: { Authorization: 'Bearer valid-token' } }
  ), env);
  assert.equal(remove.status, 204);
  assert.equal(objects.size, 0);

  const oversized = await worker.fetch(new Request('https://worker.example/receipts/expense-2', {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer valid-token',
      'Content-Type': 'application/pdf',
      'Content-Length': String(2 * 1024 * 1024 + 1)
    },
    body: new Uint8Array([1])
  }), env);
  assert.equal(oversized.status, 413);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Private R2 receipt Worker checks passed.');
