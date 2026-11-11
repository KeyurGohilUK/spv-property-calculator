import { getIconSvg } from './shared-icons.js';
import { isNewerVersion, setupUpdateNotifier } from './update-notifier.js';
import { setupDialog } from './dialog-helper.js';

export const APP_VERSION = '1.60.74';

const APP_ASSET_MANIFEST = './app-assets.json';

let deferredInstallPrompt = null;
let promptListenerAttached = false;

function createDialog() {
  const existing = document.getElementById('installDialog');
  if (existing) return existing;

  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="installDialog" class="app-dialog">
      <button id="closeInstallDialog" class="dialog-close" type="button" aria-label="Close">×</button>
      <p class="eyebrow">Install app</p>
      <h3>SPV Property Calculator</h3>
      <p class="muted small">Install the calculator on your phone for an app-like experience and offline access after the first successful visit.</p>
      <button id="nativeInstallBtn" class="primary-btn install-now-btn hidden" type="button">
        ${getIconSvg('download')}
        Install now
      </button>
      <section class="release-update-card" aria-labelledby="releaseUpdateTitle">
        <div class="release-update-heading"><div><p class="eyebrow">Latest release</p><h4 id="releaseUpdateTitle"><span id="releaseVersion">Version ${APP_VERSION}</span></h4></div><span id="releaseStatus" class="release-status">Up to date · ${APP_VERSION}</span></div>
        <ul id="releaseNotes" class="release-notes"></ul>
        <button id="downloadUpdatesBtn" class="secondary-btn download-updates-btn" type="button">
          ${getIconSvg('refresh')}
          <span data-update-label>Check for updates</span>
        </button>
        <p id="updateMessage" class="update-message" aria-live="polite"></p>
        <small class="release-data-note">Refreshes app files only. Saved properties, notes and cloud data are not deleted.</small>
      </section>
      <div class="install-platforms">
        <section class="install-platform-card"><div class="install-platform-heading"><span class="install-platform-icon" aria-hidden="true">A</span><strong>Android</strong></div><p>Open the site in <strong>Chrome</strong>, tap the <strong>⋮</strong> menu, then choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p><small>If <strong>Install now</strong> appears above, you can use it instead.</small></section>
        <section class="install-platform-card"><div class="install-platform-heading"><span class="install-platform-icon apple-icon" aria-hidden="true">●</span><strong>iPhone / iPad</strong></div><p>Open the site in <strong>Safari</strong>, tap <strong>Share</strong>, choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</p><small>Safari must be used for the iPhone/iPad Home Screen installation flow.</small></section>
      </div>
    </dialog>`);
  return document.getElementById('installDialog');
}

function renderRelease(release) {
  const version = String(release?.version || '').trim();
  const notes = Array.isArray(release?.notes) ? release.notes.map(String).map((note) => note.trim()).filter(Boolean).slice(0, 5) : [];
  const available = isNewerVersion(version, APP_VERSION);
  const button = document.getElementById('downloadUpdatesBtn');
  document.getElementById('releaseVersion').textContent = `Version ${version || APP_VERSION}`;
  const status = document.getElementById('releaseStatus');
  status.textContent = available ? `Latest ${version} · Installed ${APP_VERSION}` : `Up to date · ${APP_VERSION}`;
  status.classList.toggle('update-available', available);
  button.dataset.updateAvailable = available ? 'true' : 'false';
  button.querySelector('[data-update-label]').textContent = available ? 'Download updates' : 'Check for updates';
  const list = document.getElementById('releaseNotes');
  list.replaceChildren(...notes.map((note) => Object.assign(document.createElement('li'), { textContent: note })));
  return available;
}

async function loadRelease() {
  if (!navigator.onLine) return null;
  try {
    const response = await fetch(new URL('./release.json', document.baseURI), { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Release metadata returned ${response.status}.`);
    const release = await response.json();
    renderRelease(release);
    return release;
  } catch (error) {
    console.warn('Could not load latest release information:', error);
    return null;
  }
}

async function loadAppAssets() {
  const response = await fetch(new URL(APP_ASSET_MANIFEST, document.baseURI), {
    cache: 'reload',
    credentials: 'same-origin'
  });
  if (!response.ok) throw new Error(`App asset manifest returned ${response.status}.`);
  const manifest = await response.json();
  if (!Array.isArray(manifest.assets) || !manifest.assets.length
      || manifest.assets.some((path) => typeof path !== 'string' || !path.startsWith('./'))) {
    throw new Error('App asset manifest is invalid.');
  }
  return [APP_ASSET_MANIFEST, ...manifest.assets];
}

function setBusy(busy, label = '') {
  const button = document.getElementById('downloadUpdatesBtn');
  button.disabled = busy;
  button.classList.toggle('is-loading', busy);
  button.querySelector('[data-update-label]').textContent = busy
    ? label
    : button.dataset.updateAvailable === 'true' ? 'Download updates' : 'Check for updates';
}

async function downloadUpdates(beforeUpdate) {
  const message = document.getElementById('updateMessage');
  if (!navigator.onLine) { message.textContent = 'Connect to the internet to download updates.'; return; }
  if (beforeUpdate && await beforeUpdate() === false) return;
  setBusy(true, 'Downloading…');
  message.textContent = 'Refreshing cached app files…';
  try {
    const assets = await loadAppAssets();
    await Promise.all(assets.map(async (path) => {
      const response = await fetch(new URL(path, document.baseURI), { cache: 'reload', credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Could not refresh ${path} (${response.status}).`);
    }));
    const registration = await navigator.serviceWorker?.getRegistration?.();
    try { await registration?.update?.(); } catch (error) { console.warn('Service worker update check failed after cache refresh:', error); }
    message.textContent = 'Updates downloaded. Reloading the app…';
    window.setTimeout(() => window.location.reload(), 350);
  } catch (error) {
    console.warn('App update download failed:', error);
    message.textContent = 'Could not download updates. Check your connection and try again.';
    setBusy(false);
  }
}

export function setupInstallComponent({ button, beforeUpdate } = {}) {
  if (!button) return { open() {} };
  const dialog = createDialog();
  const nativeButton = document.getElementById('nativeInstallBtn');
  setupUpdateNotifier(button, APP_VERSION);

  if (!promptListenerAttached) {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      nativeButton.classList.remove('hidden');
    });
    promptListenerAttached = true;
  }
  const open = () => {
    nativeButton.classList.toggle('hidden', !deferredInstallPrompt);
    document.getElementById('updateMessage').textContent = '';
    loadRelease();
    dialogController.open(button);
  };
  const dialogController = setupDialog(dialog, { closeButtons: [document.getElementById('closeInstallDialog')] });
  button.addEventListener('click', open);
  nativeButton.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    const prompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    nativeButton.disabled = true;
    try { prompt.prompt(); const choice = await prompt.userChoice; if (choice?.outcome === 'accepted') dialogController.close(); }
    finally { nativeButton.disabled = false; nativeButton.classList.add('hidden'); }
  });
  document.getElementById('downloadUpdatesBtn').addEventListener('click', async () => {
    const updateButton = document.getElementById('downloadUpdatesBtn');
    if (updateButton.dataset.updateAvailable === 'true') { await downloadUpdates(beforeUpdate); return; }
    const message = document.getElementById('updateMessage');
    if (!navigator.onLine) { message.textContent = 'Connect to the internet to check for updates.'; return; }
    setBusy(true, 'Checking…'); message.textContent = 'Checking for updates…';
    const release = await loadRelease(); setBusy(false);
    message.textContent = !release ? 'Could not check for updates. Try again when online.' : updateButton.dataset.updateAvailable === 'true' ? `Version ${release.version} is available. Tap Download updates.` : 'You’re up to date.';
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null; nativeButton.classList.add('hidden'); dialogController.close();
    button.classList.remove('update-available'); button.setAttribute('aria-label', 'App installed'); button.title = 'App installed'; button.dataset.tooltip = 'App installed';
  });
  return { open, dialog };
}
