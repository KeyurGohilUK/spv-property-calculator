import { isCloudReceiptConfigured } from './receipt-cloud.js';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const VALID_ID = /^[0-9a-f]{8}-[0-9a-f-]{27,40}$/;
const COMPANY_ID = /^(default|company-[A-Za-z0-9_-]{8,80})$/;
const EXTENSIONS = ['pdf', 'jpg', 'png', 'webp', 'heic', 'heif'];

function validateScope(companyId, fileId) {
  if (!COMPANY_ID.test(companyId) || !VALID_ID.test(fileId)) throw new Error('Invalid evidence reference.');
}
function workerUrl() {
  const base = String(window.SPV_SUPABASE_CONFIG?.receiptWorkerUrl || '').replace(/\/$/, '');
  if (!base || !isCloudReceiptConfigured()) throw new Error('Private R2 evidence storage is not configured.');
  return base;
}
async function evidenceRequest(companyId, fileId, options = {}, key = '') {
  validateScope(companyId, fileId);
  const session = await window.SPVCloud?.getSession?.();
  if (!session?.access_token) throw new Error('Sign in to access compliance evidence.');
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', 'Bearer ' + session.access_token);
  const url = workerUrl() + '/compliance/' + encodeURIComponent(companyId) + '/' + encodeURIComponent(fileId) + (key ? '?key=' + encodeURIComponent(key) : '');
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || 'Private evidence request failed.');
  }
  return response;
}
export function validateEvidenceFile(file) {
  if (!file || !ALLOWED.has(file.type)) throw new Error('Select a PDF or supported image.');
  if (file.size < 1 || file.size > MAX_BYTES) throw new Error('Evidence must be 5 MB or smaller.');
  return true;
}
export async function uploadComplianceEvidence(companyId, file) {
  validateEvidenceFile(file);
  const id = crypto.randomUUID();
  const response = await evidenceRequest(companyId, id, {
    method: 'PUT',
    headers: { 'Content-Type': file.type, 'X-Receipt-Name': encodeURIComponent(file.name) },
    body: file
  });
  const uploaded = await response.json();
  if (!uploaded.objectPath?.startsWith('compliance/' + companyId + '/' + id + '.') ||
      !EXTENSIONS.includes(uploaded.objectPath.split('.').pop())) {
    throw new Error('The storage service returned an unexpected evidence reference.');
  }
  return { id, ...uploaded };
}
export async function downloadComplianceEvidence(companyId, record) {
  const response = await evidenceRequest(companyId, record.id, {}, record.objectPath);
  const bytes = await response.blob();
  const url = URL.createObjectURL(bytes);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = record.name || 'evidence';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}
export async function deleteComplianceEvidence(companyId, record) {
  await evidenceRequest(companyId, record.id, { method: 'DELETE' }, record.objectPath);
}

export async function viewComplianceEvidence(companyId, record, previewWindow) {
  const response = await evidenceRequest(companyId, record.id, {}, record.objectPath);
  const bytes = await response.blob();
  const url = URL.createObjectURL(bytes);
  if (!previewWindow || previewWindow.closed) {
    URL.revokeObjectURL(url);
    throw new Error('Allow pop-ups to view this receipt.');
  }
  previewWindow.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
