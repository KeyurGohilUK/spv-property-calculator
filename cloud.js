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

  async function signUp(email, password) {
    const supabaseClient = ensureClient();
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
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
      createdAt: data.createdAt || row.created_at || new Date().toISOString(),
      updatedAt: data.updatedAt || row.updated_at || new Date().toISOString(),
      deletedAt: data.deletedAt || row.deleted_at || null
    };
  }

  async function listProperties() {
    const supabaseClient = ensureClient();
    await requireUser();
    const { data, error } = await supabaseClient.from('properties').select('id,data,created_at,updated_at,deleted_at').order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(fromCloudRow);
  }

  async function upsertProperty(record) {
    const supabaseClient = ensureClient();
    await requireUser();
    const row = toCloudRow(record);
    const { error } = await supabaseClient.from('properties').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    return record;
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
    let downloadedCount = 0;

    for (const id of ids) {
      const local = localMap.get(id);
      const cloud = cloudMap.get(id);
      if (local && !cloud) { merged.push(local); upload.push(local); continue; }
      if (!local && cloud) { merged.push(cloud); downloadedCount += 1; continue; }
      if (!local || !cloud) continue;
      if (asTime(local.updatedAt) >= asTime(cloud.updatedAt)) {
        merged.push(local);
        if (asTime(local.updatedAt) > asTime(cloud.updatedAt)) upload.push(local);
      } else {
        merged.push(cloud);
        downloadedCount += 1;
      }
    }
    merged.sort((a, b) => asTime(b.updatedAt) - asTime(a.updatedAt));
    return { merged, upload, downloadedCount };
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
    for (const record of merge.upload) await upsertProperty(record);
    return {
      merged: merge.merged,
      uploadedCount: merge.upload.length,
      downloadedCount: merge.downloadedCount,
      archivedLegacyIds,
      permanentlyDeletedIds: locallyPurgedIds,
      deletedIds: [],
      clearedDeleteIds
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
    signUp,
    signIn,
    signOut,
    listProperties,
    upsertProperty,
    listPermanentDeletions,
    permanentlyDeleteProperty,
    syncAll,
    mergePropertySets,
    destroy
  });
})();
