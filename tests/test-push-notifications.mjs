import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  base64UrlToUint8Array,
  createPushSubscriptionService,
  getPushCapability
} from '../src/services/push-subscription.js';

const encoded = base64UrlToUint8Array('AQIDBA');
assert.deepEqual([...encoded], [1, 2, 3, 4], 'VAPID public keys must decode from base64url');

assert.equal(getPushCapability({
  navigatorRef: { serviceWorker: {}, userAgent: 'iPhone' },
  notificationRef: {},
  pushManagerRef: {},
  matchMediaRef: () => ({ matches: false })
}).supported, false, 'iPhone push must require a Home Screen installation');

const calls = [];
let activeSubscription = null;
const subscription = {
  endpoint: 'https://push.example/subscription',
  keys: { p256dh: 'public-key', auth: 'auth-key' },
  toJSON() { return { endpoint: this.endpoint, keys: this.keys }; },
  async unsubscribe() { calls.push('unsubscribe'); activeSubscription = null; return true; }
};
const registration = {
  pushManager: {
    async getSubscription() { return activeSubscription; },
    async subscribe(options) {
      assert.equal(options.userVisibleOnly, true);
      assert.ok(options.applicationServerKey instanceof Uint8Array);
      calls.push('subscribe');
      activeSubscription = subscription;
      return subscription;
    }
  }
};
const serviceWorker = {};
Object.defineProperty(serviceWorker, 'ready', {
  get() {
    calls.push('ready');
    return Promise.resolve(registration);
  }
});
const cloud = {
  getCurrentUser: () => ({ id: 'user-1' }),
  async savePushSubscription(value) { calls.push('save'); assert.equal(value.endpoint, subscription.endpoint); },
  async removePushSubscription(endpoint) { calls.push('remove'); assert.equal(endpoint, subscription.endpoint); }
};
const notificationRef = {
  permission: 'default',
  async requestPermission() { calls.push('permission'); this.permission = 'granted'; return 'granted'; }
};
const service = createPushSubscriptionService({
  cloud,
  publicKey: 'AQIDBA',
  navigatorRef: { serviceWorker, userAgent: 'Desktop', onLine: true },
  notificationRef,
  pushManagerRef: {},
  matchMediaRef: () => ({ matches: false })
});

assert.equal((await service.getState()).enabled, false);
calls.length = 0;
await service.enable();
assert.deepEqual(calls, ['permission', 'ready', 'subscribe', 'save'], 'Permission must be requested directly from the user action before awaiting the service worker');
assert.equal((await service.getState()).enabled, true);
await service.disable();
assert.deepEqual(calls.slice(-2), ['remove', 'unsubscribe'], 'Disabling must remove the server row before browser unsubscribe');

const worker = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
assert.match(worker, /addEventListener\('push'[\s\S]*showNotification/, 'Service worker push handler is missing');
assert.match(worker, /addEventListener\('notificationclick'[\s\S]*clients\.openWindow/, 'Notification click handling is missing');
assert.match(worker, /target\.origin === fallback\.origin/, 'Notification URLs must be restricted to the app origin');

const edgeFunction = fs.readFileSync(new URL('../supabase/functions/note-push/index.ts', import.meta.url), 'utf8');
assert.match(edgeFunction, /constantTimeEqual\(request\.headers\.get\('x-note-push-secret'\)/, 'Webhook authentication is missing');
assert.match(edgeFunction, /\.neq\('user_id', payload\.record\.author_user_id\)/, 'Note authors must be excluded');
assert.doesNotMatch(edgeFunction, /payload\.record\.note/, 'Notification payloads must not expose note text');
assert.match(edgeFunction, /statusCode === 404 \|\| statusCode === 410/, 'Expired subscriptions must be removed');

console.log('Push notification service and security checks passed.');
