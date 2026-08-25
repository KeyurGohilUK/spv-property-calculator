const CHECK_INTERVAL_MS = 5 * 60 * 1000;

function versionParts(value) {
  return String(value || '').split('.').map((part) => Number.parseInt(part, 10) || 0);
}

export function isNewerVersion(latest, current) {
  const next = versionParts(latest);
  const installed = versionParts(current);
  const length = Math.max(next.length, installed.length);
  for (let index = 0; index < length; index += 1) {
    if ((next[index] || 0) > (installed[index] || 0)) return true;
    if ((next[index] || 0) < (installed[index] || 0)) return false;
  }
  return false;
}

function renderState(button, available, latestVersion = '') {
  button.classList.toggle('update-available', available);
  button.dataset.updateAvailable = available ? 'true' : 'false';
  const defaultLabel = button.dataset.updateDefaultLabel || 'Install app';
  const label = available ? `Update ${latestVersion} available` : defaultLabel;
  button.title = label;
  button.dataset.tooltip = label;
  button.setAttribute('aria-label', label);
}

export function setupUpdateNotifier(button, currentVersion) {
  if (!button) return { check: async () => false };
  button.dataset.updateDefaultLabel = button.getAttribute('aria-label') || button.title || 'Install app';
  let lastCheckedAt = 0;
  let pendingCheck = null;

  async function check({ force = false } = {}) {
    if (!navigator.onLine) return false;
    if (!force && Date.now() - lastCheckedAt < CHECK_INTERVAL_MS) {
      return button.dataset.updateAvailable === 'true';
    }
    if (pendingCheck) return pendingCheck;

    pendingCheck = (async () => {
      try {
        const response = await fetch('./release.json', { cache: 'no-store' });
        if (!response.ok) throw new Error('Release check failed');
        const release = await response.json();
        const latestVersion = String(release.version || '').trim();
        const available = isNewerVersion(latestVersion, currentVersion);
        renderState(button, available, latestVersion);
        lastCheckedAt = Date.now();
        return available;
      } catch {
        return button.dataset.updateAvailable === 'true';
      } finally {
        pendingCheck = null;
      }
    })();
    return pendingCheck;
  }

  window.addEventListener('online', () => check({ force: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  check({ force: true });
  return { check };
}
