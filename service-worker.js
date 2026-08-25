const CACHE_NAME = 'spv-property-calculator-v1.21.36-feature-styles';
const ROOT = new URL('./', self.location.href).href;
const APP_SHELL = new URL('./index.html', self.location.href).href;
const CONFIG_URL = new URL('./supabase-config.js', self.location.href).href;
const RELEASE_URL = new URL('./release.json', self.location.href).href;
const SUPABASE_CDN_PREFIX = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './styles/tokens.css',
  './styles/base.css',
  './styles/app-shell-core.css',
  './styles/forms.css',
  './styles/dialogs.css',
  './styles/dialogs-updates.css',
  './styles/app-shell-home.css',
  './styles/app-shell-navigation.css',
  './styles/features/properties.css',
  './styles/features/summary.css',
  './styles/features/archive.css',
  './styles/features/editor.css',
  './styles/features/statuses.css',
  './src/components/theme.js',
  './theme.js',
  './src/components/help-guide.js',
  './help-guide.js',
  './src/app/app.js',
  './app.js',
  './src/utils/format-utils.js',
  './src/utils/validation.js',
  './format-utils.js',
  './validation.js',
  './src/features/properties/property-card.js',
  './property-card.js',
  './src/components/install-component.js',
  './install-component.js',
  './src/features/properties/calendar-invite.js',
  './src/utils/calendar-invite.js',
  './calendar-invite.js',
  './cloud.js',
  './src/features/properties/calculations.js',
  './calculations.js',
  './src/config/tax-config.js',
  './tax-config.js',
  './src/features/properties/storage.js',
  './storage.js',
  './manifest.json',
  './release.json',
  './expenses/',
  './expenses.html',
  './src/components/secondary-page-header.js',
  './secondary-page-header.js',
  './src/components/admin-menu.js',
  './admin-menu.js',
  './admin/users/',
  './manage-users.html',
  './styles/features/users.css',
  './manage-users.css',
  './src/features/users/manage-users.js',
  './manage-users.js',
  './styles/features/expenses.css',
  './expenses.css',
  './src/features/expenses/expenses.js',
  './expenses.js',
  './src/features/expenses/expense-storage.js',
  './expense-storage.js',
  './src/features/expenses/expense-cloud-sync.js',
  './expense-cloud-sync.js',
  './src/components/sync-status.js',
  './sync-status.js',
  './src/services/workspace-sync.js',
  './workspace-sync.js',
  './src/services/account-controller.js',
  './account-controller.js',
  './src/app/primary-navigation.js',
  './src/components/primary-navigation.js',
  './primary-navigation.js',
  './src/app/app-shell.js',
  './src/components/app-shell.js',
  './app-shell.js',
  './src/components/dialog-helper.js',
  './dialog-helper.js',
  './src/components/update-notifier.js',
  './update-notifier.js',
  './src/services/receipt-cloud.js',
  './receipt-cloud.js',
  './forecast/',
  './forecast.html',
  './styles/features/forecast.css',
  './forecast.css',
  './src/features/forecast/forecast.js',
  './forecast.js',
  './src/features/forecast/forecast-property.js',
  './forecast-property.js',
  './src/features/forecast/forecast-advanced.js',
  './forecast-advanced.js',
  './styles/features/forecast-advanced.css',
  './forecast-advanced.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
].map((path) => new URL(path, self.location.href).href);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);

  // Always try to refresh Supabase config when online, but retain the last working
  // copy for offline launches. This avoids an old cached config after GitHub updates.
  if (requestUrl.href === CONFIG_URL) {
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

  // Release metadata is network-first so an installed older app can show the
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
  if (requestUrl.href.startsWith(SUPABASE_CDN_PREFIX)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }))
    );
    return;
  }

  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(async () => (await caches.match(event.request)) || caches.match(APP_SHELL))
    );
    return;
  }

  // App assets are network-first so a newly deployed HTML page cannot run
  // against stale JavaScript from an earlier release. Cached files remain the
  // offline fallback when the network is unavailable.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && requestUrl.href.startsWith(ROOT)) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
