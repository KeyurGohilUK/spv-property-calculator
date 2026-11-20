import assert from 'node:assert/strict';
import worker from '../workers/receipt/src/index.js';

const files = new Map();
const env = {RECEIPTS: {
  head: async k => files.get(k) || null,
  put: async (k,bytes,metadata) => files.set(k,{body:bytes,size:bytes.byteLength,...metadata}),
  get: async k => files.get(k) || null,
  delete: async k => files.delete(k)
}, SUPABASE_URL:'https://sample.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',
 ALLOWED_ORIGINS:'https://example.test'};
const before = globalThis.fetch;
globalThis.fetch = async (uri,opts) => {
  if (String(uri).endsWith('/auth/v1/user')) return Response.json({id:'user'});
  if (String(uri).includes('/rpc/is_workspace_')) return Response.json(opts.headers.Authorization !== 'Bearer viewer' || String(uri).endsWith('is_workspace_member'));
  throw new Error('Unexpected endpoint');
};
const base='https://example.test/property-evidence/property-123/12345678-1234-4123-8123-123456789abc';
try {
  const put=async token=>worker.fetch(new Request(base,{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/pdf'},body:new Uint8Array([1])}),env);
  assert.equal((await put('viewer')).status,403);
  const uploaded=await put('editor');
  assert.equal(uploaded.status,201);
  const object=await uploaded.json();
  assert.match(object.objectPath,/^property-evidence\/property-123\//);
  assert.equal((await put('editor')).status,409);
  const key='?key='+encodeURIComponent(object.objectPath);
  assert.equal((await worker.fetch(new Request(base+key,{headers:{Authorization:'Bearer viewer'}}),env)).status,200);
  assert.equal((await worker.fetch(new Request(base.replace('property-123','property-999')+key,{headers:{Authorization:'Bearer viewer'}}),env)).status,400);
  assert.equal((await worker.fetch(new Request(base+key,{method:'DELETE',headers:{Authorization:'Bearer viewer'}}),env)).status,403);
  assert.equal((await worker.fetch(new Request(base+key,{method:'DELETE',headers:{Authorization:'Bearer editor'}}),env)).status,204);
  assert.equal(files.size,0);
} finally { globalThis.fetch=before; }
console.log('Property evidence routes, isolation and access checks passed.');
