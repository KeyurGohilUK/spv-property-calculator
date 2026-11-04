import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../workers/receipt/src/index.js';

const files = new Map();
const bucket = {
  async head(key) { return files.get(key) || null; },
  async put(key, bytes, metadata) { files.set(key, { body: bytes, size: bytes.byteLength, ...metadata }); },
  async get(key) { return files.get(key) || null; },
  async delete(key) { files.delete(key); }
};
const env = { RECEIPTS: bucket, SUPABASE_URL: 'https://sample.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'public-key', ALLOWED_ORIGINS: 'https://example.test' };
const fetchBefore = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'user-1' });
  if (String(url).includes('/rpc/is_workspace_')) {
    return Response.json(options.headers.Authorization === 'Bearer viewer' ? !String(url).endsWith('is_workspace_editor') : true);
  }
  throw new Error('Unexpected external request');
};
const base = 'https://worker.example/compliance/default/12345678-1234-4123-8123-123456789abc';
try {
  const noAuth = await worker.fetch(new Request(base, { method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' }, body: new Uint8Array([1]) }), env);
  assert.equal(noAuth.status, 401);
  const viewer = await worker.fetch(new Request(base, { method: 'PUT',
    headers: { Authorization: 'Bearer viewer', 'Content-Type': 'application/pdf' },
    body: new Uint8Array([1]) }), env);
  assert.equal(viewer.status, 403);
  const upload = await worker.fetch(new Request(base, { method: 'PUT',
    headers: { Authorization: 'Bearer editor', 'Content-Type': 'application/pdf',
      'X-Receipt-Name': encodeURIComponent('HMRC letter.pdf') },
    body: new Uint8Array([1, 2, 3]) }), env);
  assert.equal(upload.status, 201);
  const record = await upload.json();
  assert.match(record.objectPath, /^compliance\/default\/12345678-1234-4123-8123-123456789abc\.pdf$/);
  assert.equal(record.name, 'HMRC letter.pdf');
  const existing = await worker.fetch(new Request(base, { method: 'PUT',
    headers: { Authorization: 'Bearer editor', 'Content-Type': 'application/pdf' },
    body: new Uint8Array([1]) }), env);
  assert.equal(existing.status, 409);
  const key = '?key=' + encodeURIComponent(record.objectPath);
  const download = await worker.fetch(new Request(base + key, {
    headers: { Authorization: 'Bearer viewer' }
  }), env);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('Content-Disposition').startsWith('attachment;'), true);
  assert.equal(download.headers.get('X-Content-Type-Options'), 'nosniff');
  const crossCompany = await worker.fetch(new Request(base.replace('/default/', '/company-abcdefgh/') + key, {
    headers: { Authorization: 'Bearer editor' }
  }), env);
  assert.equal(crossCompany.status, 400);
  const large = await worker.fetch(new Request(base.replace('12345678-', '99999999-'), {
    method: 'PUT', headers: { Authorization: 'Bearer editor', 'Content-Type': 'application/pdf',
      'Content-Length': String(5 * 1024 * 1024 + 1) },
    body: new Uint8Array([1]) }), env);
  assert.equal(large.status, 413);
  const removeViewer = await worker.fetch(new Request(base + key, {
    method: 'DELETE', headers: { Authorization: 'Bearer viewer' }
  }), env);
  assert.equal(removeViewer.status, 403);
  const remove = await worker.fetch(new Request(base + key, {
    method: 'DELETE', headers: { Authorization: 'Bearer editor' }
  }), env);
  assert.equal(remove.status, 204);
  assert.equal(files.size, 0);
} finally {
  globalThis.fetch = fetchBefore;
}

// Validate metadata isolation and workspace profile sync shape.
const local = new Map();
globalThis.localStorage = {
  getItem: (key) => local.get(key) || null,
  setItem: (key, value) => local.set(key, String(value))
};
globalThis.sessionStorage = {
  getItem: () => null, setItem: () => {}
};
const { saveCompanyProfile, addCompanyEvidence, removeCompanyEvidence, getCompanyProfile } =
  await import('../src/features/company/company-storage.js');
saveCompanyProfile({ companyName: 'Example SPV Ltd' });
const example = {
  id: '12345678-1234-4123-8123-123456789abc',
  ruleKey: 'company-utr-received:once',
  objectPath: 'compliance/default/12345678-1234-4123-8123-123456789abc.pdf',
  name: 'HMRC letter.pdf', type: 'application/pdf', size: 1024,
  uploadedAt: '2026-11-04T10:00:00Z', uploadedBy: 'user-1'
};
addCompanyEvidence(example);
assert.equal(getCompanyProfile().complianceEvidence.length, 1);
assert.throws(() => addCompanyEvidence(example), /already attached/);
assert.equal(removeCompanyEvidence(example.id).complianceEvidence.length, 0);
assert.throws(() => addCompanyEvidence({ ...example, objectPath: 'receipts/x.pdf' }), /Invalid evidence/);
const cloud = readFileSync(new URL('../cloud.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/features/company/company.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../company/details.html', import.meta.url), 'utf8');
assert.match(cloud, /complianceEvidence: Array\.isArray/);
assert.match(ui, /data-evidence-upload/);
assert.match(ui, /downloadComplianceEvidence/);
assert.match(ui, /deleteComplianceEvidence/);
assert.ok(ui.includes('aria-label="Download ${label}"'), 'Download action has an accessible icon label');
assert.ok(ui.includes('aria-label="Remove ${label}"'), 'Remove action has an accessible icon label');
assert.ok(ui.includes('Attach document</span>'), 'HMRC attachment button keeps its text beside the icon');
assert.match(html, /id="companyEvidenceStatus"/);
console.log('Private compliance evidence Worker and metadata checks passed.');
