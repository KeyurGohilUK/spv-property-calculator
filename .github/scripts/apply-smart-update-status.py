from pathlib import Path
import json

app_path = Path('app.js')
app = app_path.read_text()

app = app.replace("const APP_VERSION = '1.8.1';", "const APP_VERSION = '1.8.2';")

old_render = '''function renderReleaseInfo(release) {
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
'''

new_render = '''function renderReleaseInfo(release) {
  if (!release || typeof release !== 'object') return;
  const version = String(release.version || '').trim();
  const notes = Array.isArray(release.notes)
    ? release.notes.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 5)
    : [];
  const updateAvailable = Boolean(version && version !== APP_VERSION);
  const updateButton = $('downloadUpdatesBtn');

  if (version) $('releaseVersion').textContent = `Version ${version}`;
  if (updateAvailable) {
    $('releaseStatus').textContent = `Latest ${version} · Installed ${APP_VERSION}`;
    $('releaseStatus').classList.add('update-available');
  } else {
    $('releaseStatus').textContent = `Up to date · ${APP_VERSION}`;
    $('releaseStatus').classList.remove('update-available');
  }

  if (updateButton) {
    updateButton.dataset.updateAvailable = updateAvailable ? 'true' : 'false';
    const label = updateButton.querySelector('[data-update-label]');
    if (label && !updateButton.disabled) {
      label.textContent = updateAvailable ? 'Download updates' : 'Check for updates';
    }
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
  if (!navigator.onLine) return null;
  try {
    const response = await fetch(new URL('./release.json', document.baseURI), {
      cache: 'no-store',
      credentials: 'same-origin'
    });
    if (!response.ok) throw new Error(`Release metadata returned ${response.status}.`);
    const release = await response.json();
    renderReleaseInfo(release);
    return release;
  } catch (error) {
    console.warn('Could not load latest release information:', error);
    return null;
  }
}

function setDownloadUpdatesBusy(busy, busyLabel = '') {
  const button = $('downloadUpdatesBtn');
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle('is-loading', busy);
  const label = button.querySelector('[data-update-label]');
  if (!label) return;
  if (busy) {
    label.textContent = busyLabel || 'Checking…';
  } else {
    label.textContent = button.dataset.updateAvailable === 'true'
      ? 'Download updates'
      : 'Check for updates';
  }
}

async function handleUpdateAction() {
  const button = $('downloadUpdatesBtn');
  const message = $('updateMessage');
  if (!button || !message) return;

  if (button.dataset.updateAvailable === 'true') {
    await downloadAppUpdates();
    return;
  }

  if (!navigator.onLine) {
    message.textContent = 'Connect to the internet to check for updates.';
    return;
  }

  setDownloadUpdatesBusy(true, 'Checking…');
  message.textContent = 'Checking for updates…';
  const release = await loadReleaseInfo();
  setDownloadUpdatesBusy(false);

  if (!release) {
    message.textContent = 'Could not check for updates. Try again when online.';
    return;
  }

  if (button.dataset.updateAvailable === 'true') {
    message.textContent = `Version ${release.version} is available. Tap Download updates.`;
  } else {
    message.textContent = 'You’re up to date.';
  }
}
'''

if old_render not in app:
    raise SystemExit('Expected release/update block was not found in app.js')
app = app.replace(old_render, new_render)

app = app.replace("  setDownloadUpdatesBusy(true);\n  message.textContent = 'Refreshing cached app files…';", "  setDownloadUpdatesBusy(true, 'Downloading…');\n  message.textContent = 'Refreshing cached app files…';")
app = app.replace("  $('downloadUpdatesBtn').addEventListener('click', downloadAppUpdates);", "  $('downloadUpdatesBtn').addEventListener('click', handleUpdateAction);")
app_path.write_text(app)

index_path = Path('index.html')
index = index_path.read_text()
index = index.replace('<span id="releaseVersion">Version 1.8.1</span>', '<span id="releaseVersion">Version 1.8.2</span>')
index = index.replace('<span id="releaseStatus" class="release-status">Installed 1.8.1</span>', '<span id="releaseStatus" class="release-status">Up to date · 1.8.2</span>')
index = index.replace('<span data-update-label>Download updates</span>', '<span data-update-label>Check for updates</span>')
index = index.replace('''      <li>Download updates inside the app</li>\n      <li>Property listing links</li>\n      <li>Fixed Save bar with cleaner spacing</li>''', '''      <li>Smarter update status and manual update checks</li>\n      <li>Download updates inside the app</li>\n      <li>Property listing links and fixed Save bar</li>''')
index_path.write_text(index)

release_path = Path('release.json')
release = json.loads(release_path.read_text())
release['version'] = '1.8.2'
release['date'] = '2026-08-13'
release['notes'] = [
    'Smarter update status and manual update checks',
    'Download updates inside the app',
    'Property listing links and fixed Save bar'
]
release_path.write_text(json.dumps(release, indent=2) + '\n')

sw_path = Path('service-worker.js')
sw = sw_path.read_text().replace('spv-property-calculator-v1.8.1-release-updates', 'spv-property-calculator-v1.8.2-smart-update-status')
sw_path.write_text(sw)
