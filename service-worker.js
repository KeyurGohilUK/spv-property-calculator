const CACHE_NAME = 'spv-property-calculator-v1.21.11-shared-account';
const ROOT = new URL('./', self.location.href).href;
const APP_SHELL = new URL('./index.html', self.location.href).href;
const CONFIG_URL = new URL('./supabase-config.js', self.location.href).href;
const RELEASE_URL = new URL('./release.json', self.location.href).href;
const SUPABASE_CDN_PREFIX = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './theme.js',
  './help-guide.js',
  './app.js',
  './install-component.js',
  './calendar-invite.js',
  './cloud.js',
  './calculations.js',
  './tax-config.js',
  './storage.js',
  './manifest.json',
  './release.json',
  './expenses.html',
  './secondary-page-header.js',
  './admin-menu.js',
  './manage-users.html',
  './manage-users.css',
  './manage-users.js',
  './expenses.css',
  './expenses.js',
  './expense-storage.js',
  './expense-cloud-sync.js',
  './sync-status.js',
  './workspace-sync.js',
  './account-controller.js',
  './update-notifier.js',
  './receipt-cloud.js',
  './forecast.html',
  './forecast.css',
  './forecast.js',
  './forecast-advanced.js',
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
