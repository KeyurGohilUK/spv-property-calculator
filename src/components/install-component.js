import { isNewerVersion, setupUpdateNotifier } from './update-notifier.js';
import { setupDialog } from './dialog-helper.js';

export const APP_VERSION = '1.26.2';

const APP_ASSET_MANIFEST = './app-assets.json';

let deferredInstallPrompt = null;
let promptListenerAttached = false;

function createDialog() {
  const existing = document.getElementById('installDialog');
  if (existing) return existing;

  const dialog = document.createElement('dialog');
  dialog.id = 'installDialog';
  dialog.className = 'install-dialog';
  dialog.innerHTML = `
    <form method="dialog" class="install-dialog-card">
      <div class="dialog-header">
        <div>
          <span class="eyebrow">App & updates</span>
          <h2>Install SPV Property Calculator</h2>
        </div>
        <button class="icon-btn" value="cancel" aria-label="Close install dialog">×</button>
      </div>
      <div class="install-dialog-body">
        <p class="muted">Install the app for quicker access and offline support where available.</p>
        <div id="installStatus" class="install-status" role="status" aria-live="polite"></div>
        <div class="install-actions">
          <button type="button" id="installNowBtn" class="primary-btn">Install now</button>
          <button type="button" id="downloadUpdatesBtn" class="secondary-btn">Check for update</button>
        </div>
        <div class="release-info">
          <strong>Version ${APP_VERSION}</strong>
          <div id="releaseNotes" class="release-notes muted"></div>
        </div>
      </div>
    </form>`;
  document.body.append(dialog);
  setupDialog(dialog);
  return dialog;
}

async function getReleaseMetadata() {
  try {
    const response = await fetch('./release.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Release metadata unavailable');
    return await response.json();
  } catch {
    return { version: APP_VERSION, notes: [] };
  }
}

async function loadAppAssets() {
  const response = await fetch(APP_ASSET_MANIFEST, { cache: 'reload' });
  if (!response.ok) throw new Error('Unable to load app asset manifest.');
  const manifest = await response.json();
  if (!Array.isArray(manifest.assets) || !manifest.assets.length) {
    throw new Error('App asset manifest is invalid.');
  }
  return manifest;
}

async function refreshAppCache(status) {
  try {
    status.textContent = 'Downloading latest app files…';
    const manifest = await loadAppAssets();
    const cacheName = `spv-property-calculator-v${manifest.version}-manual-update`;
    const cache = await caches.open(cacheName);
    await cache.addAll(manifest.assets);
    const registrations = await navigator.serviceWorker?.getRegistrations?.();
    registrations?.forEach((registration) => registration.update());
    status.textContent = 'Update downloaded. Reloading…';
    window.setTimeout(() => window.location.reload(), 500);
  } catch (error) {
    console.error('Manual app update failed', error);
    status.textContent = 'Could not download the update. Please try again when online.';
  }
}

function showInstallInstructions(status) {
  const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  status.textContent = isiOS
    ? 'On iPhone or iPad, tap Share and choose Add to Home Screen.'
    : 'Use your browser menu and choose Install app or Add to Home screen.';
}

async function renderReleaseInfo(dialog) {
  const release = await getReleaseMetadata();
  const notes = dialog.querySelector('#releaseNotes');
  if (notes) {
    notes.innerHTML = Array.isArray(release.notes) && release.notes.length
      ? `<ul>${release.notes.map((note) => `<li>${note}</li>`).join('')}</ul>`
      : 'You are using the latest available version.';
  }

  const updateButton = dialog.querySelector('#downloadUpdatesBtn');
  if (updateButton) {
    updateButton.textContent = isNewerVersion(release.version, APP_VERSION)
      ? 'Download updates'
      : 'Check for update';
  }
}

function bindInstallDialog(dialog) {
  if (dialog.dataset.bound === 'true') return;
  dialog.dataset.bound = 'true';

  const status = dialog.querySelector('#installStatus');
  const installButton = dialog.querySelector('#installNowBtn');
  const updateButton = dialog.querySelector('#downloadUpdatesBtn');

  installButton?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      showInstallInstructions(status);
      return;
    }
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    status.textContent = choice?.outcome === 'accepted'
      ? 'Install started.'
      : 'Install cancelled.';
    deferredInstallPrompt = null;
  });

  updateButton?.addEventListener('click', () => refreshAppCache(status));
}

export function setupInstallComponent(trigger) {
  const dialog = createDialog();
  bindInstallDialog(dialog);
  setupUpdateNotifier({ appVersion: APP_VERSION });

  if (!promptListenerAttached) {
    promptListenerAttached = true;
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
    });
  }

  trigger?.addEventListener('click', async () => {
    await renderReleaseInfo(dialog);
    dialog.showModal();
  });
}
