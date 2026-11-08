import { getIconSvg, hydrateSharedIcons } from '../components/shared-icons.js';
import { setupDialog } from '../components/dialog-helper.js';
import { setupNotificationSettings } from '../components/notification-settings.js';

const $ = (id, root = document) => root.getElementById(id);

const connectionIcons = `<span class="connection-online-icon">${getIconSvg('wifi')}</span><span class="connection-offline-icon">${getIconSvg('wifiOff')}</span>`;

function renderHeaderControls(root) {
  const header = root.querySelector('.header-inner');
  if (!header || header.querySelector('.header-actions')) return;
  header.insertAdjacentHTML('beforeend', `
    <div class="header-actions" role="group" aria-label="App controls">
      <span id="connectionStatus" class="header-icon-control connection-icon" role="status" tabindex="0" aria-label="Online" title="Online" data-tooltip="Online">${connectionIcons}</span>
      <button id="accountBtn" class="header-icon-control" type="button" aria-label="Sign in" title="Sign in" data-tooltip="Sign in">${getIconSvg('user')}</button>
      <button id="installBtn" class="header-icon-control" type="button" aria-label="Install app" title="Install app" data-tooltip="Install app">${getIconSvg('download')}</button>
    </div>`);
}

function syncPrimaryNavigationOffset(root) {
  const header = root.querySelector('.app-header');
  const navigation = root.querySelector('.primary-app-nav');
  if (!header || !navigation) return;

  const updateOffset = () => {
    navigation.style.setProperty('--sticky-header-offset', `${header.getBoundingClientRect().height}px`);
  };
  updateOffset();

  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(updateOffset);
    observer.observe(header);
  }
  window.addEventListener('resize', updateOffset, { passive: true });
}

function renderAppMenu(root, { home }) {
  if ($('moreMenuDialog', root)) return $('moreMenuDialog', root);
  root.body.insertAdjacentHTML('beforeend', `
    <dialog id="moreMenuDialog" class="app-dialog more-menu-dialog" aria-labelledby="appMenuTitle">
      <div class="more-menu-header"><h3 id="appMenuTitle">App Menu</h3><button id="closeMoreMenuDialog" class="icon-btn more-menu-close" type="button" aria-label="Close menu">×</button></div>
      <div class="more-menu-list">
        <a id="archiveBtn" class="more-menu-item" href="./?view=archive"><span class="more-menu-icon">${getIconSvg('restore')}</span><span><strong>Archived Properties</strong><small>Restore or permanently delete archived calculations</small></span>${home ? '<span id="archiveCountBadge" class="button-count">0</span>' : getIconSvg('chevronRight', 'more-menu-chevron')}</a>
        <a class="more-menu-item hidden" href="./admin/users/" data-admin-users-link aria-hidden="true" tabindex="-1"><span class="more-menu-icon">${getIconSvg('users')}</span><span><strong>Manage Users</strong><small>Approve accounts and assign workspace roles</small></span>${getIconSvg('chevronRight', 'more-menu-chevron')}</a>
        <button class="more-menu-item" type="button" data-help-guide><span class="more-menu-icon">${getIconSvg('help')}</span><span><strong>Help Guide</strong><small>Installation, account and app menu overview</small></span>${getIconSvg('chevronRight', 'more-menu-chevron')}</button>
        <button class="more-menu-item" type="button" data-theme-toggle aria-pressed="false"><span class="more-menu-icon theme-menu-icon"><span class="theme-icon-sun">${getIconSvg('sun')}</span><span class="theme-icon-moon">${getIconSvg('moon')}</span></span><span><strong>Theme</strong><small data-theme-description>Light appearance</small></span><span class="theme-switch" aria-hidden="true"></span></button>
        <p class="legal-menu-heading">Legal</p>
        <a class="more-menu-item" href="${new URL('../../legal/privacy.html', import.meta.url).href}"><span class="more-menu-icon">${getIconSvg('file')}</span><span><strong>Privacy &amp; Terms</strong><small>Privacy, terms, disclaimer and copyright</small></span>${getIconSvg('chevronRight', 'more-menu-chevron')}</a>
      </div>
    </dialog>`);
  return $('moreMenuDialog', root);
}

export function setupAppShell({ root = document, home = false } = {}) {
  hydrateSharedIcons(root);
  renderHeaderControls(root);
  syncPrimaryNavigationOffset(root);
  const dialog = renderAppMenu(root, { home });
  hydrateSharedIcons(dialog);
  const notificationSettings = setupNotificationSettings({ root });
  const dialogController = setupDialog(dialog, { closeButtons: [$('closeMoreMenuDialog', root)] });
  root.querySelectorAll('[data-more-menu]').forEach((control) => {
    if (control.dataset.appMenuBound) return;
    control.dataset.appMenuBound = 'true';
    control.addEventListener('click', () => {
      notificationSettings?.render();
      dialogController.open(control);
    });
  });
  window.SPVTheme?.bindThemeControls(dialog);
  window.SPVHelpGuide?.bindTriggers(dialog);
  window.dispatchEvent(new CustomEvent('spv-admin-menu-rendered'));
  return {
    connectionStatus: $('connectionStatus', root), accountButton: $('accountBtn', root),
    installButton: $('installBtn', root), menuDialog: dialog, menuDialogController: dialogController,
    notificationSettings
  };
}
