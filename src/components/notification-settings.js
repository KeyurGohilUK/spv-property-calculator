import { createPushSubscriptionService } from '../services/push-subscription.js';

const BUTTON_HTML = `
  <button class="more-menu-item" type="button" data-notification-toggle aria-pressed="false">
    <span class="more-menu-icon" aria-hidden="true">🔔</span>
    <span><strong>Notifications</strong><small data-notification-description>Checking this device…</small></span>
    <span class="theme-switch" aria-hidden="true"></span>
  </button>`;

export function setupNotificationSettings({ root = document, cloud = window.SPVCloud } = {}) {
  const menu = root.querySelector('.more-menu-list');
  if (!menu) return null;
  const existing = menu.querySelector('[data-notification-toggle]');
  if (existing?.notificationController) return existing.notificationController;

  const anchor = menu.querySelector('[data-help-guide]');
  anchor?.insertAdjacentHTML('beforebegin', BUTTON_HTML);
  if (!anchor) menu.insertAdjacentHTML('beforeend', BUTTON_HTML);
  const button = menu.querySelector('[data-notification-toggle]');
  const description = button.querySelector('[data-notification-description]');
  const service = createPushSubscriptionService({
    cloud,
    publicKey: window.SPV_SUPABASE_CONFIG?.pushPublicKey
  });
  let busy = false;

  async function render() {
    try {
      const state = await service.getState();
      button.disabled = busy || !state.available;
      button.setAttribute('aria-pressed', String(state.enabled));
      description.textContent = busy ? 'Updating this device…' : state.reason;
    } catch (error) {
      button.disabled = busy;
      button.setAttribute('aria-pressed', 'false');
      description.textContent = error.message || 'Could not check notification settings.';
    }
  }

  async function toggle() {
    if (busy) return;
    const enabled = button.getAttribute('aria-pressed') === 'true';
    busy = true;
    button.disabled = true;
    description.textContent = 'Updating this device…';
    let failureMessage = '';
    try {
      if (enabled) await service.disable();
      else await service.enable();
    } catch (error) {
      failureMessage = error.message || 'Could not update notification settings.';
    } finally {
      busy = false;
      await render();
      if (failureMessage) description.textContent = failureMessage;
    }
  }

  button.addEventListener('click', toggle);
  cloud?.onAuthChange?.((user) => {
    render();
    if (user) service.syncExisting().catch((error) => console.warn('Could not refresh push subscription:', error));
  });
  cloud?.onBeforeSignOut?.(() => service.disable());
  window.addEventListener('online', () => {
    render();
    service.syncExisting().catch((error) => console.warn('Could not refresh push subscription:', error));
  });
  render();

  const controller = Object.freeze({ render, disable: service.disable });
  button.notificationController = controller;
  return controller;
}
