const MAX_RECEIPT_SIZE = 2 * 1024 * 1024;
const RECEIPT_TYPES = new Map([
  ['application/pdf', 'pdf'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/heic', 'heic'],
  ['image/heif', 'heif']
]);

function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean));
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const headers = new Headers({ Vary: 'Origin' });
  if (origin && allowedOrigins(env).has(origin)) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Receipt-Name, X-Previous-Object-Key');
  headers.set('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type');
  headers.set('Access-Control-Max-Age', '86400');
  return headers;
}

function json(request, env, body, status = 200) {
  const headers = corsHeaders(request, env);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers });
}

function isOriginAllowed(request, env) {
  const origin = request.headers.get('Origin');
  return !origin || allowedOrigins(env).has(origin);
}

function bearerToken(request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') || '');
  return match?.[1] || '';
}

async function requireWorkspaceAccess(request, env, editor = false) {
  const token = bearerToken(request);
  if (!token) throw Object.assign(new Error('Authentication required.'), { status: 401 });
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw Object.assign(new Error('Receipt service is not configured.'), { status: 503 });
  }
  const root = env.SUPABASE_URL.replace(/\/$/, '');
  const authHeaders = { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token };
  const userResponse = await fetch(root + '/auth/v1/user', { headers: authHeaders });
  if (!userResponse.ok) throw Object.assign(new Error('Your session has expired. Please sign in again.'), { status: 401 });
  const user = await userResponse.json();
  const accessFunction = editor ? 'is_workspace_editor' : 'is_workspace_member';
  const accessResponse = await fetch(root + '/rest/v1/rpc/' + accessFunction, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: '{}'
  });
  if (!accessResponse.ok || await accessResponse.json() !== true) {
    throw Object.assign(new Error(editor ? 'Approved editor access is required.' : 'Approved workspace access is required.'), { status: 403 });
  }
  return user;
}

function expenseIdFrom(url) {
  const match = /^\/receipts\/([^/]+)$/.exec(url.pathname);
  if (!match) return '';
  const id = decodeURIComponent(match[1]);
  return /^[A-Za-z0-9_-]{1,160}$/.test(id) ? id : '';
}

function objectKeyFor(url, expenseId) {
  const key = url.searchParams.get('key') || '';
  return key.startsWith('receipts/' + expenseId + '/') && /^[A-Za-z0-9_./-]+$/.test(key) ? key : '';
}

function decodeReceiptName(value) {
  try { return decodeURIComponent(value || '').slice(0, 180) || 'receipt'; }
  catch { return 'receipt'; }
}

async function uploadReceipt(request, env, expenseId) {
  const user = await requireWorkspaceAccess(request, env, true);
  const contentType = String(request.headers.get('Content-Type') || '').toLowerCase().split(';')[0];
  const extension = RECEIPT_TYPES.get(contentType);
  if (!extension) return json(request, env, { error: 'Unsupported receipt file type.' }, 415);
  const declaredSize = Number(request.headers.get('Content-Length')) || 0;
  if (declaredSize > MAX_RECEIPT_SIZE) return json(request, env, { error: 'Receipt must be 2 MB or smaller.' }, 413);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_RECEIPT_SIZE) {
    return json(request, env, { error: 'Receipt must be between 1 byte and 2 MB.' }, 413);
  }
  const originalName = decodeReceiptName(request.headers.get('X-Receipt-Name'));
  const objectPath = 'receipts/' + expenseId + '/' + crypto.randomUUID() + '.' + extension;
  await env.RECEIPTS.put(objectPath, bytes, {
    httpMetadata: { contentType },
    customMetadata: { expenseId, uploadedBy: String(user.id || ''), originalName }
  });
  const previousPath = request.headers.get('X-Previous-Object-Key') || '';
  if (previousPath && previousPath !== objectPath && previousPath.startsWith('receipts/' + expenseId + '/')) {
    await env.RECEIPTS.delete(previousPath);
  }
  return json(request, env, {
    objectPath,
    name: originalName,
    type: contentType,
    size: bytes.byteLength,
    uploadedAt: new Date().toISOString()
  }, 201);
}

async function downloadReceipt(request, env, url, expenseId) {
  await requireWorkspaceAccess(request, env, false);
  const objectPath = objectKeyFor(url, expenseId);
  if (!objectPath) return json(request, env, { error: 'Invalid receipt object key.' }, 400);
  const object = await env.RECEIPTS.get(objectPath);
  if (!object) return json(request, env, { error: 'Receipt not found.' }, 404);
  const headers = corsHeaders(request, env);
  object.writeHttpMetadata?.(headers);
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  const originalName = object.customMetadata?.originalName || 'receipt';
  headers.set('Content-Disposition', "inline; filename*=UTF-8''" + encodeURIComponent(originalName));
  headers.set('Cache-Control', 'private, no-store');
  if (object.size) headers.set('Content-Length', String(object.size));
  return new Response(object.body, { headers });
}

async function deleteReceipt(request, env, url, expenseId) {
  await requireWorkspaceAccess(request, env, true);
  const objectPath = objectKeyFor(url, expenseId);
  if (!objectPath) return json(request, env, { error: 'Invalid receipt object key.' }, 400);
  await env.RECEIPTS.delete(objectPath);
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

// Company compliance evidence uses the same private R2 bucket and workspace ACL.
// A random file UUID prevents guessing object references; paths are always scoped
// to a specific company. Receipt routes and their 2 MB cap remain unchanged.
const MAX_EVIDENCE_SIZE = 5 * 1024 * 1024;
function evidenceRoute(url) {
  const match = /^\/compliance\/(default|company-[A-Za-z0-9_-]{8,80})\/([0-9a-f]{8}-[0-9a-f-]{27,40})$/.exec(url.pathname);
  return match ? { companyId: match[1], fileId: match[2] } : null;
}
function evidenceObjectKey(url, companyId, fileId) {
  const key = url.searchParams.get('key') || '';
  return /^compliance\/(?:default|company-[A-Za-z0-9_-]{8,80})\/[0-9a-f-]+\.(?:pdf|jpg|png|webp|heic|heif)$/.test(key)
    && key.startsWith('compliance/' + companyId + '/' + fileId + '.') ? key : '';
}
async function uploadEvidence(request, env, route) {
  const user = await requireWorkspaceAccess(request, env, true);
  const type = String(request.headers.get('Content-Type') || '').toLowerCase().split(';')[0];
  const ext = RECEIPT_TYPES.get(type);
  if (!ext) return json(request, env, { error: 'Upload a PDF or supported image.' }, 415);
  if (Number(request.headers.get('Content-Length')) > MAX_EVIDENCE_SIZE) {
    return json(request, env, { error: 'Evidence files must not exceed 5 MB.' }, 413);
  }
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_EVIDENCE_SIZE) {
    return json(request, env, { error: 'Evidence files must be between 1 byte and 5 MB.' }, 413);
  }
  const objectPath = 'compliance/' + route.companyId + '/' + route.fileId + '.' + ext;
  // Do not overwrite an existing evidence object by reusing its UUID.
  if (await env.RECEIPTS.head(objectPath)) return json(request, env, { error: 'Evidence reference already exists.' }, 409);
  const originalName = decodeReceiptName(request.headers.get('X-Receipt-Name'));
  await env.RECEIPTS.put(objectPath, bytes, {
    httpMetadata: { contentType: type },
    customMetadata: { companyId: route.companyId, fileId: route.fileId, uploadedBy: String(user.id || ''), originalName }
  });
  return json(request, env, {
    objectPath, name: originalName, type, size: bytes.byteLength,
    uploadedAt: new Date().toISOString(), uploadedBy: String(user.id || '')
  }, 201);
}
async function downloadEvidence(request, env, url, route) {
  await requireWorkspaceAccess(request, env, false);
  const objectPath = evidenceObjectKey(url, route.companyId, route.fileId);
  if (!objectPath) return json(request, env, { error: 'Invalid evidence object reference.' }, 400);
  const object = await env.RECEIPTS.get(objectPath);
  if (!object) return json(request, env, { error: 'Evidence file not found.' }, 404);
  const headers = corsHeaders(request, env);
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(object.customMetadata?.originalName || 'evidence'));
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body, { headers });
}
async function deleteEvidence(request, env, url, route) {
  await requireWorkspaceAccess(request, env, true);
  const objectPath = evidenceObjectKey(url, route.companyId, route.fileId);
  if (!objectPath) return json(request, env, { error: 'Invalid evidence object reference.' }, 400);
  await env.RECEIPTS.delete(objectPath);
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

export default {
  async fetch(request, env) {
    if (!isOriginAllowed(request, env)) return json(request, env, { error: 'Origin not allowed.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return json(request, env, { ok: true, service: 'spv-receipt-service' });
    }
    const evidence = evidenceRoute(url);
    if (evidence) {
      try {
        if (request.method === 'PUT') return await uploadEvidence(request, env, evidence);
        if (request.method === 'GET') return await downloadEvidence(request, env, url, evidence);
        if (request.method === 'DELETE') return await deleteEvidence(request, env, url, evidence);
        return json(request, env, { error: 'Method not allowed.' }, 405);
      } catch (error) {
        return json(request, env, { error: error.message || 'Evidence service unavailable.' }, Number(error.status) || 500);
      }
    }
    const expenseId = expenseIdFrom(url);
    if (!expenseId) return json(request, env, { error: 'Not found.' }, 404);
    try {
      if (request.method === 'PUT') return await uploadReceipt(request, env, expenseId);
      if (request.method === 'GET') return await downloadReceipt(request, env, url, expenseId);
      if (request.method === 'DELETE') return await deleteReceipt(request, env, url, expenseId);
      return json(request, env, { error: 'Method not allowed.' }, 405);
    } catch (error) {
      return json(request, env, { error: error.message || 'Receipt service failed.' }, Number(error.status) || 500);
    }
  }
};
