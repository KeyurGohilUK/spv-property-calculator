const CACHE_NAME = 'spv-property-calculator-v1.21.43-legal-pages';
const ROOT = new URL('./', self.location.href).href;
const APP_SHELL = new URL('./index.html', self.location.href).href;
const CONFIG_URL = new URL('./supabase-config.js', self.location.href).href;
const RELEASE_URL = new URL('./release.json', self.location.href).href;
const SUPABASE_CDN_PREFIX = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3';

const CACHE_PREFIX = 'spv-property-calculator-';
const ASSET_MANIFEST_URL = new URL('./app-assets.json', self.location.href).href;

async function cacheAppAssets() {
  const response = await fetch(ASSET_MANIFEST_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`App asset manifest returned ${response.status}.`);
  const manifest = await response.clone().json();
  if (!Array.isArray(manifest.assets) || !manifest.assets.length) {
    throw new Error('App asset manifest is invalid.');
  }
  const cache = await caches.open(CACHE_NAME);
  await cache.put(ASSET_MANIFEST_URL, response);
  await cache.addAll(manifest.assets.map((path) => new URL(path, self.location.href).href));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    cacheAppAssets()
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function getNotificationUrl(value) {
  const fallback = new URL('./', self.registration.scope);
  try {
    const target = new URL(String(value || './'), self.registration.scope);
    return target.origin === fallback.origin && target.href.startsWith(fallback.href)
      ? target.href
      : fallback.href;
  } catch {
    return fallback.href;
  }
}

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json?.() || {}; } catch { payload = {}; }
  const title = String(payload.title || 'New property note');
  const options = {
    body: String(payload.body || 'A new note was added to a shared property.'),
    icon: new URL('./icons/icon-192.png', self.registration.scope).href,
    badge: new URL('./icons/favicon-32.png', self.registration.scope).href,
    tag: String(payload.tag || 'property-note'),
    renotify: true,
    data: { url: getNotificationUrl(payload.url) }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = getNotificationUrl(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appWindow = windows.find((client) => client.url.startsWith(self.registration.scope));
    if (appWindow) {
      await appWindow.navigate(targetUrl);
      return appWindow.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
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
