const SUPABASE_SDK_PATTERN = /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/;

const MOCK_SUPABASE_SDK = `
(() => {
  const options = window.__PW_CLOUD_OPTIONS__ || {};
  const state = window.__PW_CLOUD_STATE__ = {
    calls: [],
    properties: [...(options.properties || [])],
    expenses: [...(options.expenses || [])]
  };
  const now = '2026-08-23T12:00:00.000Z';
  const session = {
    access_token: 'playwright-access-token',
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'playwright@example.test',
      user_metadata: { display_name: 'Playwright User' }
    }
  };

  function listResult(table) {
    if (table === 'properties' && options.propertyListError) {
      return { data: null, error: { message: options.propertyListError, code: 'PGRST_TEST' } };
    }
    if (table === 'expenses' && options.expenseListError) {
      return { data: null, error: { message: options.expenseListError, code: 'PGRST_TEST' } };
    }
    if (table === 'property_deletions') return { data: [], error: null };
    return { data: state[table] || [], error: null };
  }

  function query(table) {
    const builder = {
      select() { return builder; },
      order() { return Promise.resolve(listResult(table)); },
      eq() { return builder; },
      delete() { return builder; },
      insert(value) {
        state.calls.push({ type: 'insert', table, value });
        return builder;
      },
      single() { return Promise.resolve(listResult(table)); },
      then(resolve, reject) { return Promise.resolve(listResult(table)).then(resolve, reject); }
    };
    return builder;
  }

  function rpc(name, args) {
    state.calls.push({ type: 'rpc', name, args });
    const conflict = name === 'upsert_property_if_current'
      ? options.propertyConflict
      : name === 'upsert_expense_if_current' && options.expenseConflict;
    const result = conflict
      ? { data: null, error: { code: '40001', message: name.startsWith('upsert_property') ? 'PROPERTY_CONFLICT' : 'EXPENSE_CONFLICT' } }
      : {
          data: {
            new_revision: Math.max(1, Number(args?.p_expected_revision || 0) + 1),
            server_created_at: now,
            server_updated_at: now
          },
          error: null
        };
    return {
      single() { return Promise.resolve(result); },
      then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); }
    };
  }

  window.supabase = {
    createClient() {
      return {
        auth: {
          onAuthStateChange() {
            return { data: { subscription: { unsubscribe() {} } } };
          },
          getSession() {
            return Promise.resolve({ data: { session }, error: null });
          },
          signOut() {
            return Promise.resolve({ error: null });
          },
          updateUser({ data }) {
            session.user.user_metadata = { ...session.user.user_metadata, ...data };
            return Promise.resolve({ data: { user: session.user }, error: null });
          }
        },
        from: query,
        rpc
      };
    }
  };
})();
`;

export async function installCloudMock(page, options = {}) {
  await page.addInitScript((mockOptions) => {
    window.__PW_CLOUD_OPTIONS__ = mockOptions;
  }, options);

  await page.route(SUPABASE_SDK_PATTERN, (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: MOCK_SUPABASE_SDK
  }));
}

export async function cloudCalls(page) {
  return page.evaluate(() => window.__PW_CLOUD_STATE__?.calls || []);
}
