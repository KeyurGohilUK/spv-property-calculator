import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);

  const jwt = request.headers.get('Authorization')?.replace(/^Bearer /i, '') || '';
  if (!jwt) return respond({ error: 'Authentication required' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const apiKey = Deno.env.get('COMPANIES_HOUSE_API_KEY');
  if (!url || !anonKey || !apiKey) return respond({ error: 'Company lookup is not configured' }, 503);

  try {
    const client = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: auth, error: authError } = await client.auth.getUser(jwt);
    if (authError || !auth.user) return respond({ error: 'Authentication required' }, 401);

    const { data: member, error: memberError } = await client.from('workspace_members')
      .select('active').eq('user_id', auth.user.id).maybeSingle();
    if (memberError || !member?.active) return respond({ error: 'Workspace access denied' }, 403);

    const payload = await request.json().catch(() => null);
    const companyNumber = String(payload?.companyNumber || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{2}[0-9]{6}$/.test(companyNumber)) {
      return respond({ error: 'Enter a valid eight-character company number' }, 400);
    }

    const result = await fetch(`https://api.company-information.service.gov.uk/company/${companyNumber}`, {
      headers: { Authorization: 'Basic ' + btoa(apiKey + ':'), Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (result.status === 404) return respond({ error: 'Company not found' }, 404);
    if (!result.ok) return respond({ error: 'Companies House is temporarily unavailable' }, 502);

    const record = await result.json();
    if (String(record.company_number || '').toUpperCase() !== companyNumber) {
      return respond({ error: 'Unexpected company response' }, 502);
    }
    // Only return public fields needed by the app; never return the API key.
    return respond({
      companyNumber,
      companyName: String(record.company_name || '').slice(0, 160),
      accounts: { next_accounts: { due_on: record.accounts?.next_accounts?.due_on || null }, last_accounts: { period_end_on: record.accounts?.last_accounts?.period_end_on || null, made_up_to: record.accounts?.last_accounts?.made_up_to || null }, overdue: record.accounts?.overdue === true },
      confirmation_statement: { next_due: record.confirmation_statement?.next_due || null, last_made_up_to: record.confirmation_statement?.last_made_up_to || null, overdue: record.confirmation_statement?.overdue === true },
      fetchedAt: new Date().toISOString()
    });
  } catch {
    return respond({ error: 'Company lookup failed. Try again later.' }, 502);
  }
});
