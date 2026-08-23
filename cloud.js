/*
 * SPV Property Calculator - shared Supabase cloud sync
 * Uses the browser/UMD build of @supabase/supabase-js loaded by index.html.
 * Local storage remains the offline-first source used by app.js.
 */
(() => {
  'use strict';

  const config = window.SPV_SUPABASE_CONFIG || {};
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3';
  let client = null;
  let initialized = false;
  let currentUser = null;
  let authSubscription = null;
  let sdkLoadPromise = null;
  let sdkLoadError = '';
  const listeners = new Set();

  function isConfigured() {
    const url = String(config.url || '').trim();
    const key = String(config.publishableKey || config.anonKey || '').trim();
    return /^https:\/\/.+\.supabase\.co\/?$/i.test(url)
      && !url.includes('YOUR_PROJECT_REF')
      && key.length > 20
      && !key.includes('REPLACE_ME');
  }

  function getConfigState() {
    if (!isConfigured()) {
      return { configured: false, available: false, reason: 'Supabase is not configured yet.' };
    }
    if (sdkLoadError) {
      return { configured: true, available: false, reason: sdkLoadError };
    }
    return { configured: true, available: true, reason: '' };
  }

  function loadSdk() {
    if (window.supabase?.createClient) return Promise.resolve();
    if (sdkLoadPromise) return sdkLoadPromise;

    sdkLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-spv-supabase-sdk="true"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Supabase library could not be loaded.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = SDK_URL;
      script.async = true;
      script.dataset.spvSupabaseSdk = 'true';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Supabase library could not be loaded. Check your internet connection.'));
      document.head.appendChild(script);
    }).catch((error) => {
      sdkLoadError = error.message || 'Supabase library could not be loaded.';
      sdkLoadPromise = null;
      throw error;
    });

    return sdkLoadPromise;
  }

  function ensureClient() {
    if (client) return client;
    if (!isConfigured()) throw new Error('Supabase is not configured yet.');
    if (!window.supabase?.createClient) throw new Error('Supabase library is not loaded yet.');

    client = window.supabase.createClient(
      String(config.url).replace(/\/$/, ''),
      String(config.publishableKey || config.anonKey),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'implicit'
        }
      }
    );
    return client;
  }

  function emitAuth(user, event = 'AUTH_STATE') {
    currentUser = user || null;
    for (const listener of listeners) {
      try { listener(currentUser, event); } catch (error) { console.warn('Cloud auth listener failed:', error); }
    }
  }

  async function init() {
    const configuredState = getConfigState();
    if (!configuredState.configured) return { ...configuredState, user: null };
    if (initialized) return { ...getConfigState(), user: currentUser };

    try {
      await loadSdk();
      sdkLoadError = '';
    } catch (error) {
      return { configured: true, available: false, reason: error.message, user: null };
    }

    const state = getConfigState();
    const supabaseClient = ensureClient();
    initialized = true;

    const { data: subscriptionData } = supabaseClient.auth.onAuthStateChange((event, session) => {
      emitAuth(session?.user || null, event);
    });
    authSubscription = subscriptionData?.subscription || null;

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) console.warn('Could not restore Supabase session:', error);
    currentUser = data?.session?.user || null;

    return { ...state, user: currentUser };
  }

  function onAuthChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  async function getSession() {
    const supabaseClient = ensureClient();
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    currentUser = data?.session?.user || null;
    return data?.session || null;
  }

  async function signUp(email, password, displayName = '') {
    const supabaseClient = ensureClient();
    const name = String(displayName || '').trim();
    const credentials = name
      ? { email, password, options: { data: { display_name: name } } }
      : { email, password };
    const { data, error } = await supabaseClient.auth.signUp(credentials);
    if (error) throw error;
    if (data?.session?.user) emitAuth(data.session.user, 'SIGNED_IN');
    return data;
  }

  async function signIn(email, password) {
    const supabaseClient = ensureClient();
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    emitAuth(data?.user || data?.session?.user || null, 'SIGNED_IN');
    return data;
  }

  async function signOut() {
    const supabaseClient = ensureClient();
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    emitAuth(null, 'SIGNED_OUT');
  }

  function getUserDisplayName(user = currentUser) {
    if (!user) return '';
    const metadata = user.user_metadata || {};
    return String(metadata.display_name || metadata.full_name || metadata.name || user.email || '').trim();
  }

  async function updateDisplayName(displayName) {
    const supabaseClient = ensureClient();
    await requireUser();
    const name = String(displayName || '').trim();
    if (!name) throw new Error('Enter a display name.');
    const { data, error } = await supabaseClient.auth.updateUser({ data: { display_name: name } });
    if (error) throw error;
    emitAuth(data?.user || currentUser, 'USER_UPDATED');
    return data?.user || currentUser;
  }

  async function requireUser() {
    const session = await getSession();
    if (!session?.user) throw new Error('Please sign in to use cloud sync.');
    return session.user;
  }

  function toCloudRow(record) {
    const now = new Date().toISOString();
    return {
      id: String(record.id),
      data: record,
      created_at: record.createdAt || now,
      updated_at: record.updatedAt || now,
      deleted_at: record.deletedAt || null
    };
  }

  function fromCloudRow(row) {
    const data = row?.data && typeof row.data === 'object' ? row.data : {};
    return {
      ...data,
      id: String(row.id),
      createdAt: row.created_at || data.createdAt || new Date().toISOString(),
      updatedAt: row.updated_at || data.updatedAt || new Date().toISOString(),
      deletedAt: row.deleted_at || data.deletedAt || null,
      _cloudRevision: Math.max(0, Number(row.revision) || 0),
      _cloudDirty: false
    };
  }

  async function listProperties() {
    const supabaseClient = ensureClient();
    await requireUser();
    const { data, error } = await supabaseClient.from('properties').select('id,data,created_at,updated_at,deleted_at,revision').order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(fromCloudRow);
  }

  function isPropertyConflict(error) {
    return error?.code === '40001'
      || String(error?.message || '').includes('PROPERTY_CONFLICT');
  }

  async function upsertProperty(record) {
    const supabaseClient = ensureClient();
    await requireUser();
    const { _cloudRevision, _cloudDirty, ...propertyData } = record || {};
    const expectedRevision = Math.max(0, Number(_cloudRevision) || 0);
    const { data, error } = await supabaseClient
      .rpc('upsert_property_if_current', {
        p_id: String(record.id),
        p_data: propertyData,
        p_created_at: record.createdAt || null,
        p_deleted_at: record.deletedAt || null,
        p_expected_revision: expectedRevision
      })
      .single();
    if (error) {
      if (isPropertyConflict(error)) {
        const conflict = new Error('This property changed on another device. Your local changes are safe; review the latest cloud version before retrying.');
        conflict.code = 'PROPERTY_CONFLICT';
        conflict.propertyId = String(record.id);
        throw conflict;
      }
      throw error;
    }
    return {
      ...record,
      createdAt: data?.server_created_at || record.createdAt,
      updatedAt: data?.server_updated_at || record.updatedAt,
      _cloudRevision: Math.max(1, Number(data?.new_revision) || expectedRevision + 1),
      _cloudDirty: false
    };
  }

  async function listNotes(propertyId) {
    const supabaseClient = ensureClient();
    await requireUser();
    const id = String(propertyId || '').trim();
    if (!id) return [];
    const { data, error } = await supabaseClient
      .from('property_notes')
      .select('id,property_id,author_user_id,author_name,note,created_at')
      .eq('property_id', id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function addNote(propertyId, noteText) {
    const supabaseClient = ensureClient();
    const user = await requireUser();
    const id = String(propertyId || '').trim();
    const note = String(noteText || '').trim();
    if (!id) throw new Error('Save the property before adding a note.');
    if (!note) throw new Error('Enter a note first.');
    const authorName = getUserDisplayName(user) || user.email || 'Signed-in user';
    const { data, error } = await supabaseClient
      .from('property_notes')
      .insert({
        property_id: id,
        author_user_id: user.id,
        author_name: authorName,
        note
      })
      .select('id,property_id,author_user_id,author_name,note,created_at')
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteNote(noteId) {
    const supabaseClient = ensureClient();
    const user = await requireUser();
    const id = String(noteId || '').trim();
    if (!id) throw new Error('Note ID is required.');

    const { data, error } = await supabaseClient
      .from('property_notes')
      .delete()
      .eq('id', id)
      .eq('author_user_id', user.id)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('You can only delete your own notes.');
    return true;
  }

  async function listPermanentDeletions() {
    const supabaseClient = ensureClient();
    await requireUser();
    const { data, error } = await supabaseClient
      .from('property_deletions')
      .select('id,deleted_at')
      .order('deleted_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function permanentlyDeleteProperty(id) {
    const supabaseClient = ensureClient();
    await requireUser();
    const propertyId = String(id || '').trim();
    if (!propertyId) throw new Error('Property ID is required.');
    const { error } = await supabaseClient.rpc('permanently_delete_property', { p_id: propertyId });
    if (error) throw error;
    return true;
  }


  function fromCloudExpense(row) {
    return {
      id: String(row.id),
      amount: Number(row.amount) || 0,
      date: row.expense_date || '',
      category: row.category || 'Other',
      scope: row.scope === 'property' ? 'property' : 'company',
      propertyId: row.property_id || '',
      description: row.description || '',
      notes: row.notes || '',
      receipt: row.receipt_metadata || null,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || new Date().toISOString(),
      deletedAt: row.deleted_at || null,
      _cloudRevision: Math.max(0, Number(row.revision) || 0),
      _cloudDirty: false
    };
  }

  async function listExpenses() {
    const supabaseClient = ensureClient();
    await requireUser();
    const { data, error } = await supabaseClient
      .from('expenses')
      .select('id,amount,expense_date,category,scope,property_id,description,notes,receipt_metadata,created_at,updated_at,deleted_at,revision')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(fromCloudExpense);
  }

  function isExpenseConflict(error) {
    return error?.code === '40001'
      || String(error?.message || '').includes('EXPENSE_CONFLICT');
  }

  async function upsertExpense(record) {
    const supabaseClient = ensureClient();
    await requireUser();
    const expectedRevision = Math.max(0, Number(record?._cloudRevision) || 0);
    const { data, error } = await supabaseClient
      .rpc('upsert_expense_if_current', {
        p_id: String(record.id),
        p_amount: Number(record.amount),
        p_expense_date: record.date,
        p_category: record.category || 'Other',
        p_scope: record.scope === 'property' ? 'property' : 'company',
        p_property_id: record.scope === 'property' ? String(record.propertyId || '') : null,
        p_description: record.description || '',
        p_notes: record.notes || '',
        p_receipt_metadata: record.receipt || null,
        p_receipt_object_path: null,
        p_deleted_at: record.deletedAt || null,
        p_expected_revision: expectedRevision
      })
      .single();
    if (error) {
      if (isExpenseConflict(error)) {
        const conflict = new Error('This expense changed on another device. Your local change has been kept.');
        conflict.code = 'EXPENSE_CONFLICT';
        conflict.expenseId = String(record.id);
        throw conflict;
      }
      throw error;
    }
    return {
      ...record,
      createdAt: data?.server_created_at || record.createdAt,
      updatedAt: data?.server_updated_at || record.updatedAt,
      _cloudRevision: Math.max(1, Number(data?.new_revision) || expectedRevision + 1),
      _cloudDirty: false
    };
  }

  function asTime(value) {
    const time = Date.parse(value || '');
    return Number.isFinite(time) ? time : 0;
  }

  function mergePropertySets(localProperties, cloudProperties) {
    const localMap = new Map((localProperties || []).map((item) => [String(item.id), item]));
    const cloudMap = new Map((cloudProperties || []).map((item) => [String(item.id), item]));
    const ids = new Set([...localMap.keys(), ...cloudMap.keys()]);
    const merged = [];
    const upload = [];
    const conflicts = [];
    let downloadedCount = 0;

    for (const id of ids) {
      const local = localMap.get(id);
      const cloud = cloudMap.get(id);
      if (local && !cloud) { merged.push(local); upload.push(local); continue; }
      if (!local && cloud) { merged.push(cloud); downloadedCount += 1; continue; }
      if (!local || !cloud) continue;

      const localRevision = Math.max(0, Number(local._cloudRevision) || 0);
      const cloudRevision = Math.max(0, Number(cloud._cloudRevision) || 0);

      if (local._cloudDirty) {
        if (localRevision === cloudRevision) {
          merged.push(local);
          upload.push(local);
        } else {
          // Preserve the unsynced local copy. Never silently replace it.
          merged.push(local);
          conflicts.push({ id, local, cloud });
        }
        continue;
      }

      if (asTime(local.updatedAt) >= asTime(cloud.updatedAt)) {
        merged.push(local);
        if (asTime(local.updatedAt) > asTime(cloud.updatedAt)) upload.push(local);
      } else {
        merged.push(cloud);
        downloadedCount += 1;
      }
    }
    merged.sort((a, b) => asTime(b.updatedAt) - asTime(a.updatedAt));
    return { merged, upload, conflicts, downloadedCount };
  }

  async function syncAll(localProperties, pendingDeletes = []) {
    await requireUser();

    // Permanent deletion tombstones contain no property data; they only prevent
    // another user's offline cache from re-uploading a property that was purged.
    const permanentDeletions = await listPermanentDeletions();
    const permanentlyDeletedIds = new Set(permanentDeletions.map((item) => String(item.id)));
    const locallyPurgedIds = (localProperties || [])
      .filter((item) => permanentlyDeletedIds.has(String(item.id)))
      .map((item) => String(item.id));

    const cleanLocalProperties = (localProperties || [])
      .filter((item) => !permanentlyDeletedIds.has(String(item.id)));

    // Convert old offline hard-delete tombstones from pre-archive versions into
    // archived rows, unless that property has since been permanently deleted.
    let cloudProperties = (await listProperties())
      .filter((item) => !permanentlyDeletedIds.has(String(item.id)));
    const cloudById = new Map(cloudProperties.map((item) => [String(item.id), item]));
    const clearedDeleteIds = [];
    const archivedLegacyIds = [];

    for (const tombstone of pendingDeletes || []) {
      const id = String(tombstone?.id || tombstone || '');
      if (!id) continue;
      if (permanentlyDeletedIds.has(id)) { clearedDeleteIds.push(id); continue; }
      const cloud = cloudById.get(id);
      const deletedAt = typeof tombstone === 'object' ? tombstone.deletedAt : '';
      if (!cloud) { clearedDeleteIds.push(id); continue; }
      if (asTime(deletedAt) >= asTime(cloud.updatedAt)) {
        const when = deletedAt || new Date().toISOString();
        const archived = { ...cloud, deletedAt: when, updatedAt: when };
        await upsertProperty(archived);
        cloudById.set(id, archived);
        archivedLegacyIds.push(id);
      }
      clearedDeleteIds.push(id);
    }

    cloudProperties = [...cloudById.values()];
    const merge = mergePropertySets(cleanLocalProperties, cloudProperties);
    const mergedById = new Map(merge.merged.map((item) => [String(item.id), item]));
    const conflicts = [...merge.conflicts];
    let uploadedCount = 0;

    for (const record of merge.upload) {
      try {
        const synced = await upsertProperty(record);
        mergedById.set(String(record.id), synced);
        uploadedCount += 1;
      } catch (error) {
        if (!isPropertyConflict(error)) throw error;
        conflicts.push({ id: String(record.id), local: record, cloud: null });
      }
    }

    return {
      merged: [...mergedById.values()].sort((a, b) => asTime(b.updatedAt) - asTime(a.updatedAt)),
      uploadedCount,
      downloadedCount: merge.downloadedCount,
      archivedLegacyIds,
      permanentlyDeletedIds: locallyPurgedIds,
      deletedIds: [],
      clearedDeleteIds,
      conflicts
    };
  }

  function destroy() {
    authSubscription?.unsubscribe?.();
    authSubscription = null;
    listeners.clear();
  }

  window.SPVCloud = Object.freeze({
    isConfigured,
    getConfigState,
    init,
    onAuthChange,
    getSession,
    getCurrentUser: () => currentUser,
    getUserDisplayName,
    updateDisplayName,
    signUp,
    signIn,
    signOut,
    listProperties,
    listExpenses,
    upsertExpense,
    isExpenseConflict,
    listNotes,
    addNote,
    deleteNote,
    upsertProperty,
    listPermanentDeletions,
    permanentlyDeleteProperty,
    syncAll,
    mergePropertySets,
    destroy
  });
})();
