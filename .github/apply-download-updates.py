from pathlib import Path


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'{label} not found in {path}')
    p.write_text(text.replace(old, new, 1))


# index.html — add release/update card inside the existing install dialog.
old = '''  <button id="nativeInstallBtn" class="primary-btn install-now-btn hidden" type="button">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5v10"></path>
      <path d="m8.5 10.5 3.5 3.5 3.5-3.5"></path>
      <path d="M5 16.5v2.2c0 1 .8 1.8 1.8 1.8h10.4c1 0 1.8-.8 1.8-1.8v-2.2"></path>
    </svg>
    Install now
  </button>

  <div class="install-platforms">'''
new = '''  <button id="nativeInstallBtn" class="primary-btn install-now-btn hidden" type="button">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5v10"></path>
      <path d="m8.5 10.5 3.5 3.5 3.5-3.5"></path>
      <path d="M5 16.5v2.2c0 1 .8 1.8 1.8 1.8h10.4c1 0 1.8-.8 1.8-1.8v-2.2"></path>
    </svg>
    Install now
  </button>

  <section class="release-update-card" aria-labelledby="releaseUpdateTitle">
    <div class="release-update-heading">
      <div>
        <p class="eyebrow">Latest release</p>
        <h4 id="releaseUpdateTitle"><span id="releaseVersion">Version 1.8.1</span></h4>
      </div>
      <span id="releaseStatus" class="release-status">Installed 1.8.1</span>
    </div>
    <ul id="releaseNotes" class="release-notes">
      <li>Download updates inside the app</li>
      <li>Property listing links</li>
      <li>Fixed Save bar with cleaner spacing</li>
    </ul>
    <button id="downloadUpdatesBtn" class="secondary-btn download-updates-btn" type="button">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 6v5h-5"></path>
        <path d="M4 18v-5h5"></path>
        <path d="M6.1 9a7 7 0 0 1 11.6-2.6L20 9"></path>
        <path d="m4 15 2.3 2.6A7 7 0 0 0 17.9 15"></path>
      </svg>
      <span data-update-label>Download updates</span>
    </button>
    <p id="updateMessage" class="update-message" aria-live="polite"></p>
    <small class="release-data-note">Refreshes app files only. Saved properties, notes and cloud data are not deleted.</small>
  </section>

  <div class="install-platforms">'''
replace_once('index.html', old, new, 'install release insertion')


# app.js — add version/cache metadata.
old = "let savedPropertySnapshot = '';\n"
new = """let savedPropertySnapshot = '';

const APP_VERSION = '1.8.1';
const APP_CACHE_PREFIX = 'spv-property-calculator-';
const APP_UPDATE_ASSETS = Object.freeze([
  './',
  './index.html',
  './styles.css',
  './app.js',
  './cloud.js',
  './calculations.js',
  './tax-config.js',
  './storage.js',
  './manifest.json',
  './supabase-config.js',
  './release.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
]);
"""
replace_once('app.js', old, new, 'app release constants')


# app.js — add release rendering and cache refresh behaviour before setupInstall.
marker = 'function setupInstall() {'
functions = r'''function renderReleaseInfo(release) {
  if (!release || typeof release !== 'object') return;
  const version = String(release.version || '').trim();
  const notes = Array.isArray(release.notes)
    ? release.notes.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 5)
    : [];

  if (version) $('releaseVersion').textContent = `Version ${version}`;
  if (version && version !== APP_VERSION) {
    $('releaseStatus').textContent = `Latest ${version} · Installed ${APP_VERSION}`;
    $('releaseStatus').classList.add('update-available');
  } else {
    $('releaseStatus').textContent = `Installed ${APP_VERSION}`;
    $('releaseStatus').classList.remove('update-available');
  }

  if (notes.length) {
    const list = $('releaseNotes');
    list.innerHTML = '';
    notes.forEach((note) => {
      const item = document.createElement('li');
      item.textContent = note;
      list.appendChild(item);
    });
  }
}

async function loadReleaseInfo() {
  if (!navigator.onLine) return;
  try {
    const response = await fetch(new URL('./release.json', document.baseURI), {
      cache: 'no-store',
      credentials: 'same-origin'
    });
    if (!response.ok) throw new Error(`Release metadata returned ${response.status}.`);
    renderReleaseInfo(await response.json());
  } catch (error) {
    console.warn('Could not load latest release information:', error);
  }
}

function setDownloadUpdatesBusy(busy) {
  const button = $('downloadUpdatesBtn');
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle('is-loading', busy);
  const label = button.querySelector('[data-update-label]');
  if (label) label.textContent = busy ? 'Downloading…' : 'Download updates';
}

async function downloadAppUpdates() {
  const message = $('updateMessage');
  if (!navigator.onLine) {
    message.textContent = 'Connect to the internet to download updates.';
    return;
  }

  const editorIsOpen = !$('editorView').classList.contains('hidden');
  const hasUnsavedChanges = editorIsOpen && getEditablePropertySnapshot() !== savedPropertySnapshot;
  if (hasUnsavedChanges && !window.confirm('You have unsaved property changes. Downloading updates reloads the app and will discard those unsaved changes. Continue?')) {
    return;
  }

  setDownloadUpdatesBusy(true);
  message.textContent = 'Refreshing cached app files…';

  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith(APP_CACHE_PREFIX))
          .map((name) => caches.delete(name))
      );
    }

    // Re-fetch every local app-shell file with browser HTTP caching bypassed.
    // The active service worker will store these fresh responses back into its cache.
    await Promise.all(APP_UPDATE_ASSETS.map(async (path) => {
      const url = new URL(path, document.baseURI);
      const response = await fetch(url, {
        cache: 'reload',
        credentials: 'same-origin'
      });
      if (!response.ok) throw new Error(`Could not refresh ${path} (${response.status}).`);
      return response;
    }));

    // Explicitly ask the browser to check service-worker.js now instead of waiting
    // for its normal update interval. New workers already use skipWaiting().
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        try {
          await registration.update();
        } catch (error) {
          console.warn('Service worker update check failed after cache refresh:', error);
        }
      }
    }

    message.textContent = 'Updates downloaded. Reloading the app…';
    window.setTimeout(() => window.location.reload(), 350);
  } catch (error) {
    console.warn('App update download failed:', error);
    message.textContent = 'Could not download updates. Check your connection and try again.';
    setDownloadUpdatesBusy(false);
  }
}

'''
p = Path('app.js')
text = p.read_text()
if marker not in text:
    raise SystemExit('setupInstall marker not found')
p.write_text(text.replace(marker, functions + marker, 1))


# Load release info whenever the install popup opens.
old = '''  $('installBtn').addEventListener('click', () => {
    $('nativeInstallBtn').classList.toggle('hidden', !deferredInstallPrompt);
    $('installDialog').showModal();
  });'''
new = '''  $('installBtn').addEventListener('click', () => {
    $('nativeInstallBtn').classList.toggle('hidden', !deferredInstallPrompt);
    $('updateMessage').textContent = '';
    loadReleaseInfo();
    $('installDialog').showModal();
  });'''
replace_once('app.js', old, new, 'install popup release loader')


# Wire Download updates button.
old = "  $('closeInstallDialog').addEventListener('click', () => $('installDialog').close());\n"
new = "  $('downloadUpdatesBtn').addEventListener('click', downloadAppUpdates);\n\n  $('closeInstallDialog').addEventListener('click', () => $('installDialog').close());\n"
replace_once('app.js', old, new, 'download updates click handler')


# styles.css — release/update UI.
p = Path('styles.css')
text = p.read_text()
text += r'''

/* v1.8.1 release notes + manual PWA cache refresh */
.release-update-card {
  margin-top: 16px;
  padding: 15px;
  border: 1px solid color-mix(in srgb, var(--brand) 22%, var(--border));
  border-radius: 16px;
  background: color-mix(in srgb, var(--brand-soft) 38%, var(--surface));
}
.release-update-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.release-update-heading h4 { margin: 3px 0 0; font-size: 16px; }
.release-status {
  display: inline-flex;
  align-items: center;
  min-height: 27px;
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
}
.release-status.update-available {
  background: color-mix(in srgb, var(--brand) 13%, var(--surface));
  color: var(--brand);
}
.release-notes {
  margin: 12px 0 13px;
  padding-left: 19px;
  color: var(--text);
  font-size: 12px;
  line-height: 1.5;
}
.release-notes li + li { margin-top: 3px; }
.download-updates-btn {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid color-mix(in srgb, var(--brand) 25%, var(--border));
  color: var(--brand);
  background: var(--surface);
}
.download-updates-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--brand) 7%, var(--surface));
}
.download-updates-btn svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.download-updates-btn.is-loading svg { animation: update-refresh-spin .8s linear infinite; }
@keyframes update-refresh-spin { to { transform: rotate(360deg); } }
.update-message {
  min-height: 17px;
  margin: 8px 2px 0;
  color: var(--brand);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.4;
}
.release-data-note {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.4;
}
@media (max-width: 430px) {
  .release-update-card { padding: 13px; }
  .release-update-heading { align-items: center; }
  .release-status { max-width: 160px; white-space: normal; text-align: right; }
}
'''
p.write_text(text)


# service-worker.js — cache bump + release metadata network-first handling.
old = "const CACHE_NAME = 'spv-property-calculator-v1.8.0-save-bar-gap';"
new = "const CACHE_NAME = 'spv-property-calculator-v1.8.1-release-updates';"
replace_once('service-worker.js', old, new, 'service worker cache version')

old = "const CONFIG_URL = new URL('./supabase-config.js', self.location.href).href;\n"
new = "const CONFIG_URL = new URL('./supabase-config.js', self.location.href).href;\nconst RELEASE_URL = new URL('./release.json', self.location.href).href;\n"
replace_once('service-worker.js', old, new, 'release URL constant')

old = "  './manifest.json',\n"
new = "  './manifest.json',\n  './release.json',\n"
replace_once('service-worker.js', old, new, 'release asset cache entry')

old = '''  // Cache the pinned Supabase browser SDK after the first successful online load.
  // If unavailable later, the core calculator still works from local assets.
  if (requestUrl.href.startsWith(SUPABASE_CDN_PREFIX)) {'''
new = '''  // Release metadata is network-first so an installed older app can show the
  // latest version notes before its main app-shell cache is refreshed.
  if (requestUrl.href === RELEASE_URL) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache the pinned Supabase browser SDK after the first successful online load.
  // If unavailable later, the core calculator still works from local assets.
  if (requestUrl.href.startsWith(SUPABASE_CDN_PREFIX)) {'''
replace_once('service-worker.js', old, new, 'release network-first handler')

print('Release/update feature applied.')
