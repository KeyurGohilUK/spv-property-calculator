const IOS_PATTERN = /iPad|iPhone|iPod/;

export function base64UrlToUint8Array(value) {
  const input = String(value || '').trim();
  if (!input) throw new Error('Push notifications are not configured yet.');
  const padding = '='.repeat((4 - (input.length % 4)) % 4);
  const base64 = (input + padding).replaceAll('-', '+').replaceAll('_', '/');
  const binary = globalThis.atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function isStandaloneApp({ navigatorRef = globalThis.navigator, matchMediaRef = globalThis.matchMedia } = {}) {
  return Boolean(navigatorRef?.standalone || matchMediaRef?.('(display-mode: standalone)')?.matches);
}

export function getPushCapability({
  navigatorRef = globalThis.navigator,
  notificationRef = globalThis.Notification,
  pushManagerRef = globalThis.PushManager,
  matchMediaRef = globalThis.matchMedia
} = {}) {
  if (!navigatorRef?.serviceWorker || !notificationRef || !pushManagerRef) {
    return { supported: false, reason: 'Push notifications are not supported on this device.' };
  }
  const isIos = IOS_PATTERN.test(String(navigatorRef.userAgent || ''));
  if (isIos && !isStandaloneApp({ navigatorRef, matchMediaRef })) {
    return { supported: false, reason: 'Install the app on your Home Screen to enable notifications.' };
  }
  return { supported: true, reason: '' };
}

export function createPushSubscriptionService({
  cloud,
  publicKey,
  navigatorRef = globalThis.navigator,
  notificationRef = globalThis.Notification,
  pushManagerRef = globalThis.PushManager,
  matchMediaRef = globalThis.matchMedia
} = {}) {
  const capability = () => getPushCapability({ navigatorRef, notificationRef, pushManagerRef, matchMediaRef });
  const currentUser = () => cloud?.getCurrentUser?.() || null;

  async function getRegistration() {
    const state = capability();
    if (!state.supported) throw new Error(state.reason);
    return navigatorRef.serviceWorker.ready;
  }

  async function getSubscription() {
    if (!capability().supported) return null;
    const registration = await getRegistration();
    return registration.pushManager.getSubscription();
  }

  async function getState() {
    const support = capability();
    if (!support.supported) return { enabled: false, available: false, reason: support.reason };
    if (!String(publicKey || '').trim()) {
      return { enabled: false, available: false, reason: 'Notification server setup is required.' };
    }
    if (!currentUser()) return { enabled: false, available: false, reason: 'Sign in to enable notifications.' };
    if (notificationRef.permission === 'denied') {
      return { enabled: false, available: false, reason: 'Notifications are blocked in device settings.' };
    }
    const subscription = await getSubscription();
    return {
      enabled: Boolean(subscription),
      available: true,
      reason: subscription ? 'Enabled on this device' : 'Off on this device'
    };
  }

  async function enable() {
    if (!currentUser()) throw new Error('Sign in to enable notifications.');
    if (!cloud?.savePushSubscription) throw new Error('Notification sync is unavailable.');
    const applicationServerKey = base64UrlToUint8Array(publicKey);
    const permissionRequest = notificationRef.permission === 'granted'
      ? Promise.resolve('granted')
      : notificationRef.requestPermission();
    const permission = await permissionRequest;
    if (permission !== 'granted') throw new Error('Notification permission was not granted.');
    const registration = await getRegistration();

    let subscription = await registration.pushManager.getSubscription();
    let created = false;
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });
      created = true;
    }
    try {
      await cloud.savePushSubscription(subscription.toJSON());
    } catch (error) {
      if (created) await subscription.unsubscribe().catch(() => {});
      throw error;
    }
    return subscription;
  }

  async function disable() {
    const subscription = await getSubscription();
    if (!subscription) return false;
    let removalError = null;
    try {
      if (currentUser() && cloud?.removePushSubscription) {
        await cloud.removePushSubscription(subscription.endpoint);
      }
    } catch (error) {
      removalError = error;
    }
    await subscription.unsubscribe();
    if (removalError) throw removalError;
    return true;
  }

  async function syncExisting() {
    if (!currentUser() || !cloud?.savePushSubscription || !navigatorRef.onLine) return false;
    const subscription = await getSubscription();
    if (!subscription) return false;
    await cloud.savePushSubscription(subscription.toJSON());
    return true;
  }

  return Object.freeze({ getState, enable, disable, syncExisting });
}
