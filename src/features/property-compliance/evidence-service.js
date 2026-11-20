import { isCloudReceiptConfigured } from '../../services/receipt-cloud.js';
import { validateEvidenceFile } from '../../services/compliance-evidence.js';

const SAFE_ID = /^[A-Za-z0-9_-]{1,160}$/;
const SAFE_UUID = /^[0-9a-f]{8}-[0-9a-f-]{27,40}$/;
const EXT = /\.(pdf|jpg|png|webp|heic|heif)$/;
function verify(propertyId, fileId) {
  if (!SAFE_ID.test(propertyId) || !SAFE_UUID.test(fileId)) throw new Error('Invalid property evidence reference.');
}
async function request(propertyId, fileId, options = {}, objectPath = '') {
  verify(propertyId, fileId);
  if (!isCloudReceiptConfigured()) throw new Error('Private evidence storage is not configured.');
  const session = await window.SPVCloud?.getSession?.();
  if (!session?.access_token) throw new Error('Sign in to access property documents.');
  const base = String(window.SPV_SUPABASE_CONFIG?.receiptWorkerUrl || '').replace(/\/$/, '');
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', 'Bearer ' + session.access_token);
  const uri = base + '/property-evidence/' + encodeURIComponent(propertyId) + '/' + encodeURIComponent(fileId)
    + (objectPath ? '?key=' + encodeURIComponent(objectPath) : '');
  const response = await fetch(uri, {...options, headers});
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || 'Private evidence request failed.');
  }
  return response;
}
export async function uploadPropertyEvidence(propertyId, file) {
  validateEvidenceFile(file);
  const id = crypto.randomUUID();
  const response = await request(propertyId, id, {
    method: 'PUT',
    headers: { 'Content-Type': file.type, 'X-Receipt-Name': encodeURIComponent(file.name) },
    body: file
  });
  const uploaded = await response.json();
  if (!uploaded.objectPath?.startsWith('property-evidence/' + propertyId + '/' + id + '.') ||
      !EXT.test(uploaded.objectPath)) throw new Error('Unexpected evidence reference returned.');
  return {id, ...uploaded};
}
export async function downloadPropertyEvidence(propertyId, record) {
  if (!record?.objectPath?.startsWith('property-evidence/' + propertyId + '/' + record.id + '.') ||
      !EXT.test(record.objectPath)) throw new Error('Invalid evidence object reference.');
  const response = await request(propertyId, record.id, {}, record.objectPath);
  const url = URL.createObjectURL(await response.blob());
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = record.name || 'property-evidence';
    document.body.append(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}
export async function deletePropertyEvidence(propertyId, record) {
  if (!record?.objectPath?.startsWith('property-evidence/' + propertyId + '/' + record.id + '.') ||
      !EXT.test(record.objectPath)) throw new Error('Invalid evidence object reference.');
  await request(propertyId, record.id, {method:'DELETE'}, record.objectPath);
}
