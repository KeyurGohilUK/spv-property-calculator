import { getProperties, replaceProperties, getPendingDeletes, clearPendingDeletes } from './storage.js';
import { getAllExpenses, replaceExpenses } from './expense-storage.js';

const APP_VERSION = '1.16.0';
const $ = (id) => document.getElementById(id);
const header = document.querySelector('.header-inner');
let cloudUser = null;
let syncing = false;
let deferredInstallPrompt = null;

function closeOnBackdrop(dialog) {
  dialog.addEventListener('click', (event) => {
    const bounds = dialog.getBoundingClientRect();
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right
      && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    if (!inside) dialog.close();
  });
}

function expenseTime(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

async function syncExpenses(cloud) {
  const localItems = getAllExpenses();
  const remoteItems = await cloud.listExpenses();
  const localMap = new Map(localItems.map((item) => [String(item.id), item]));
  const remoteMap = new Map(remoteItems.map((item) => [String(item.id), item]));
  const merged = new Map();
  const upload = [];
  const conflicts = [];

  for (const id of new Set([...localMap.keys(), ...remoteMap.keys()])) {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);
    if (local && !remote) { merged.set(id, local); upload.push(local); continue; }
    if (!local && remote) { merged.set(id, remote); continue; }
    if (!local || !remote) continue;
    const localRevision = Math.max(0, Number(local._cloudRevision) || 0);
    const remoteRevision = Math.max(0, Number(remote._cloudRevision) || 0);
    if (local._cloudDirty) {
      merged.set(id, local);
      if (localRevision === remoteRevision) upload.push(local);
      else conflicts.push(id);
    } else if (remoteRevision > localRevision || expenseTime(remote.updatedAt) > expenseTime(local.updatedAt)) {
      merged.set(id, remote);
    } else if (expenseTime(local.updatedAt) > expenseTime(remote.updatedAt)) {
      merged.set(id, local); upload.push(local);
    } else {
      merged.set(id, remote);
    }
  }

  let uploaded = 0;
  for (const item of upload) {
    try {
      const saved = await cloud.upsertExpense(item);
      merged.set(String(item.id), saved);
      uploaded += 1;
    } catch (error) {
      if (cloud.isExpenseConflict?.(error)) { conflicts.push(String(item.id)); continue; }
      throw error;
    }
  }
  replaceExpenses([...merged.values()]);
  return { changes: uploaded + remoteItems.filter((item) => !localMap.has(String(item.id))).length, conflicts };
}

async function syncWorkspace() {
  if (syncing || !cloudUser || !navigator.onLine) return;
  const cloud = window.SPVCloud;
  syncing = true;
  renderAccount();
  $('secondaryAccountMessage').textContent = 'Syncing properties and expenses…';
  try {
    const properties = await cloud.syncAll(getProperties(), getPendingDeletes());
    replaceProperties(properties.merged);
    clearPendingDeletes(properties.clearedDeleteIds || []);
    const expenses = await syncExpenses(cloud);
    const conflicts = (properties.conflicts?.length || 0) + expenses.conflicts.length;
    $('secondaryAccountMessage').textContent = conflicts
      ? `${conflicts} conflict${conflicts === 1 ? '' : 's'} kept locally for review.`
      : 'Properties and expenses are up to date.';
    window.dispatchEvent(new CustomEvent('spv-workspace-synced'));
  } catch (error) {
    console.warn('Workspace sync failed:', error);
    $('secondaryAccountMessage').textContent = 'Sync pending. Local changes remain safe.';
  } finally {
    syncing = false;
    renderAccount();
  }
}

function renderAccount() {
  const configured = window.SPVCloud?.getConfigState?.().configured;
  $('secondaryAuthSetup').classList.toggle('hidden', configured !== false);
  $('secondarySignedOut').classList.toggle('hidden', !configured || Boolean(cloudUser));
  $('secondarySignedIn').classList.toggle('hidden', !configured || !cloudUser);
  $('secondaryAccountBtn').classList.toggle('is-signed-in', Boolean(cloudUser));
  $('secondaryAccountBtn').dataset.tooltip = cloudUser ? 'Account' : 'Sign in';
  $('secondaryAccountBtn').title = cloudUser ? 'Account' : 'Sign in';
  $('secondaryAccountBtn').setAttribute('aria-label', cloudUser ? 'Account' : 'Sign in');
  if (cloudUser) {
    $('secondarySignedInEmail').textContent = cloudUser.email || 'Signed-in user';
    $('secondarySyncBtn').disabled = syncing || !navigator.onLine;
    $('secondarySyncBtn').textContent = syncing ? 'Syncing…' : 'Sync now';
  }
}

async function setupCloudAccount() {
  const cloud = window.SPVCloud;
  if (!cloud) { renderAccount(); return; }
  cloud.onAuthChange((user) => {
    cloudUser = user || null;
    renderAccount();
  });
  try {
    const state = await cloud.init();
    cloudUser = state.user || null;
  } catch (error) {
    console.warn('Account setup failed:', error);
  }
  renderAccount();
}

async function loadRelease() {
  const message = $('secondaryUpdateMessage');
  try {
    const response = await fetch('./release.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Release check failed');
    const release = await response.json();
    const available = release.version && release.version !== APP_VERSION;
    $('secondaryReleaseVersion').textContent = `Version ${release.version || APP_VERSION}`;
    $('secondaryUpdateBtn').textContent = available ? 'Download updates' : 'Check for updates';
    $('secondaryUpdateBtn').dataset.available = available ? 'true' : 'false';
    $('secondaryReleaseNotes').innerHTML = (release.notes || []).slice(0, 4).map((note) => `<li>${String(note).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</li>`).join('');
    message.textContent = available ? `Version ${release.version} is available.` : 'You’re up to date.';
  } catch {
    message.textContent = navigator.onLine ? 'Could not check for updates.' : 'Connect to the internet to check for updates.';
  }
}

async function handleUpdate() {
  if ($('secondaryUpdateBtn').dataset.available !== 'true') { await loadRelease(); return; }
  $('secondaryUpdateMessage').textContent = 'Downloading updates…';
  $('secondaryUpdateBtn').disabled = true;
  try {
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith('spv-property-calculator-')).map((name) => caches.delete(name)));
    }
    const registration = await navigator.serviceWorker?.getRegistration?.();
    await registration?.update?.();
    window.location.reload();
  } catch {
    $('secondaryUpdateMessage').textContent = 'Could not download updates. Try again.';
    $('secondaryUpdateBtn').disabled = false;
  }
}

if (header && !header.querySelector('.header-actions')) {
  const actions = document.createElement('div');
  actions.className = 'header-actions';
  actions.setAttribute('aria-label', 'App controls');
  actions.innerHTML = `
    <span id="secondaryConnectionStatus" class="header-icon-control connection-icon" role="status" tabindex="0" aria-label="Online" title="Online" data-tooltip="Online">
      <svg class="connection-online-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9.5a10.2 10.2 0 0 1 14 0"></path><path d="M8 13a5.8 5.8 0 0 1 8 0"></path><path d="M10.8 16.3a1.8 1.8 0 0 1 2.4 0"></path><circle cx="12" cy="18.5" r="1"></circle></svg>
      <svg class="connection-offline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 4.5 19.5 19.5"></path><path d="M5 9.5a10.2 10.2 0 0 1 10.8-2.1"></path><path d="M18.8 10.7c.1.1.1.1.2.2"></path><path d="M8 13a5.8 5.8 0 0 1 3-1.5"></path><path d="M14.8 13.8c.4.2.8.5 1.2.8"></path><circle cx="12" cy="18.5" r="1"></circle></svg>
    </span>
    <button id="secondaryAccountBtn" class="header-icon-control" type="button" aria-label="Account" title="Account" data-tooltip="Account"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.25"></circle><path d="M5.5 19c.7-3.5 3-5.3 6.5-5.3s5.8 1.8 6.5 5.3"></path></svg></button>
    <button id="secondaryInstallBtn" class="header-icon-control" type="button" aria-label="Install app" title="Install app" data-tooltip="Install app"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v10"></path><path d="m8.5 10.5 3.5 3.5 3.5-3.5"></path><path d="M5 16.5v2.2c0 1 .8 1.8 1.8 1.8h10.4c1 0 1.8-.8 1.8-1.8v-2.2"></path></svg></button>`;
  header.appendChild(actions);

  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="secondaryAccountDialog" class="install-dialog auth-dialog">
      <button id="closeSecondaryAccount" class="dialog-close" type="button" aria-label="Close">×</button>
      <div id="secondarySignedOut"><p class="eyebrow">Cloud sync</p><h3>Supabase account</h3>
        <label class="field"><span>Your name</span><input id="secondaryAuthName" type="text" autocomplete="name" maxlength="80"></label>
        <label class="field"><span>Email</span><input id="secondaryAuthEmail" type="email" autocomplete="email"></label>
        <label class="field"><span>Password</span><input id="secondaryAuthPassword" type="password" autocomplete="current-password" minlength="6"></label>
        <div class="auth-actions"><button id="secondarySignInBtn" class="primary-btn" type="button">Sign in</button><button id="secondarySignUpBtn" class="secondary-btn" type="button">Create account</button></div>
        <p id="secondaryAuthMessage" class="auth-message" aria-live="polite"></p>
      </div>
      <div id="secondarySignedIn" class="hidden"><p class="eyebrow">Cloud sync</p><h3>Signed in</h3><p id="secondarySignedInEmail" class="muted"></p>
        <div class="auth-account-card"><strong>Supabase connected</strong><small>Properties and expenses share the same workspace.</small></div>
        <div class="auth-actions"><button id="secondarySyncBtn" class="primary-btn" type="button">Sync now</button><button id="secondarySignOutBtn" class="secondary-btn" type="button">Sign out</button></div>
        <p id="secondaryAccountMessage" class="auth-message" aria-live="polite"></p>
      </div>
      <div id="secondaryAuthSetup" class="hidden"><p class="eyebrow">Cloud sync</p><h3>Supabase setup required</h3><p>Configure the Project URL and Publishable key in <code>supabase-config.js</code>.</p></div>
    </dialog>
    <dialog id="secondaryInstallDialog" class="install-dialog">
      <button id="closeSecondaryInstall" class="dialog-close" type="button" aria-label="Close">×</button>
      <p class="eyebrow">Install app</p><h3>SPV Property Calculator</h3>
      <p class="muted small">Install the calculator for an app-like experience and offline access.</p>
      <button id="secondaryNativeInstallBtn" class="primary-btn install-now-btn hidden" type="button">Install now</button>
      <section class="release-update-card"><div class="release-update-heading"><div><p class="eyebrow">Latest release</p><h4 id="secondaryReleaseVersion">Version ${APP_VERSION}</h4></div></div>
        <ul id="secondaryReleaseNotes" class="release-notes"></ul>
        <button id="secondaryUpdateBtn" class="secondary-btn download-updates-btn" type="button">Check for updates</button>
        <p id="secondaryUpdateMessage" class="update-message" aria-live="polite"></p>
      </section>
      <div class="install-platforms"><section class="install-platform-card"><strong>Android</strong><p>In Chrome, open the menu and choose Install app or Add to Home screen.</p></section>
      <section class="install-platform-card"><strong>iPhone / iPad</strong><p>In Safari, tap Share, choose Add to Home Screen, then Add.</p></section></div>
    </dialog>
  `);

  const updateConnection = () => {
    const status = $('secondaryConnectionStatus');
    status.classList.toggle('offline', !navigator.onLine);
    const label = navigator.onLine ? 'Online' : 'Offline';
    status.setAttribute('aria-label', label); status.title = label; status.dataset.tooltip = label;
    renderAccount();
  };
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
  updateConnection();

  $('secondaryAccountBtn').addEventListener('click', () => { renderAccount(); $('secondaryAccountDialog').showModal(); });
  $('secondaryInstallBtn').addEventListener('click', () => { $('secondaryNativeInstallBtn').classList.toggle('hidden', !deferredInstallPrompt); $('secondaryInstallDialog').showModal(); loadRelease(); });
  $('closeSecondaryAccount').addEventListener('click', () => $('secondaryAccountDialog').close());
  $('closeSecondaryInstall').addEventListener('click', () => $('secondaryInstallDialog').close());
  closeOnBackdrop($('secondaryAccountDialog')); closeOnBackdrop($('secondaryInstallDialog'));

  $('secondarySignInBtn').addEventListener('click', async () => {
    $('secondaryAuthMessage').textContent = 'Signing in…';
    try { const data = await window.SPVCloud.signIn($('secondaryAuthEmail').value.trim(), $('secondaryAuthPassword').value); cloudUser = data.user || data.session?.user; $('secondaryAuthMessage').textContent = ''; renderAccount(); await syncWorkspace(); }
    catch (error) { $('secondaryAuthMessage').textContent = error.message || 'Could not sign in.'; }
  });
  $('secondarySignUpBtn').addEventListener('click', async () => {
    $('secondaryAuthMessage').textContent = 'Creating account…';
    try { const data = await window.SPVCloud.signUp($('secondaryAuthEmail').value.trim(), $('secondaryAuthPassword').value, $('secondaryAuthName').value.trim()); cloudUser = data.session?.user || null; $('secondaryAuthMessage').textContent = cloudUser ? '' : 'Account created. Confirm your email, then sign in.'; renderAccount(); }
    catch (error) { $('secondaryAuthMessage').textContent = error.message || 'Could not create account.'; }
  });
  $('secondarySignOutBtn').addEventListener('click', async () => { await window.SPVCloud.signOut(); cloudUser = null; $('secondaryAccountDialog').close(); renderAccount(); });
  $('secondarySyncBtn').addEventListener('click', syncWorkspace);
  $('secondaryUpdateBtn').addEventListener('click', handleUpdate);
  $('secondaryNativeInstallBtn').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $('secondaryNativeInstallBtn').classList.add('hidden');
  });
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstallPrompt = event; });
  setupCloudAccount();
}

const moreControl = document.querySelector('[data-more-menu]');
if (moreControl) {
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="secondaryMoreMenuDialog" class="install-dialog more-menu-dialog">
      <div class="more-menu-header"><h3>App Menu</h3><button id="closeSecondaryMoreMenu" class="icon-btn more-menu-close" type="button" aria-label="Close menu">×</button></div>
      <div class="more-menu-list"><a class="more-menu-item" href="./?view=archive"><span class="more-menu-icon" aria-hidden="true">↺</span><span><strong>Archived Properties</strong><small>Restore or permanently delete archived calculations</small></span><span aria-hidden="true">›</span></a></div>
    </dialog>`);
  const dialog = $('secondaryMoreMenuDialog');
  moreControl.addEventListener('click', () => dialog.showModal());
  $('closeSecondaryMoreMenu').addEventListener('click', () => dialog.close());
  closeOnBackdrop(dialog);
}
