import { setupDialog } from './src/components/dialog-helper.js';

const $ = (id, root = document) => root.getElementById(id);

const connectionIcons = `
  <svg class="connection-online-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9.5a10.2 10.2 0 0 1 14 0"></path><path d="M8 13a5.8 5.8 0 0 1 8 0"></path><path d="M10.8 16.3a1.8 1.8 0 0 1 2.4 0"></path><circle cx="12" cy="18.5" r="1"></circle></svg>
  <svg class="connection-offline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 4.5 19.5 19.5"></path><path d="M5 9.5a10.2 10.2 0 0 1 10.8-2.1"></path><path d="M18.8 10.7c.1.1.1.1.2.2"></path><path d="M8 13a5.8 5.8 0 0 1 3-1.5"></path><path d="M14.8 13.8c.4.2.8.5 1.2.8"></path><circle cx="12" cy="18.5" r="1"></circle></svg>`;

function renderHeaderControls(root) {
  const header = root.querySelector('.header-inner');
  if (!header || header.querySelector('.header-actions')) return;
  header.insertAdjacentHTML('beforeend', `
    <div class="header-actions" role="group" aria-label="App controls">
      <span id="connectionStatus" class="header-icon-control connection-icon" role="status" tabindex="0" aria-label="Online" title="Online" data-tooltip="Online">${connectionIcons}</span>
      <button id="accountBtn" class="header-icon-control" type="button" aria-label="Sign in" title="Sign in" data-tooltip="Sign in"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.25"></circle><path d="M5.5 19c.7-3.5 3-5.3 6.5-5.3s5.8 1.8 6.5 5.3"></path></svg></button>
      <button id="installBtn" class="header-icon-control" type="button" aria-label="Install app" title="Install app" data-tooltip="Install app"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v10"></path><path d="m8.5 10.5 3.5 3.5 3.5-3.5"></path><path d="M5 16.5v2.2c0 1 .8 1.8 1.8 1.8h10.4c1 0 1.8-.8 1.8-1.8v-2.2"></path></svg></button>
    </div>`);
}

function renderAppMenu(root, { home }) {
  if ($('moreMenuDialog', root)) return $('moreMenuDialog', root);
  root.body.insertAdjacentHTML('beforeend', `
    <dialog id="moreMenuDialog" class="install-dialog more-menu-dialog" aria-labelledby="appMenuTitle">
      <div class="more-menu-header"><h3 id="appMenuTitle">App Menu</h3><button id="closeMoreMenuDialog" class="icon-btn more-menu-close" type="button" aria-label="Close menu">×</button></div>
      <div class="more-menu-list">
        <a id="archiveBtn" class="more-menu-item" href="./?view=archive"><span class="more-menu-icon" aria-hidden="true">↺</span><span><strong>Archived Properties</strong><small>Restore or permanently delete archived calculations</small></span>${home ? '<span id="archiveCountBadge" class="button-count">0</span>' : '<span aria-hidden="true">›</span>'}</a>
        <a class="more-menu-item hidden" href="./admin/users/" data-admin-users-link aria-hidden="true" tabindex="-1"><span class="more-menu-icon" aria-hidden="true">♙</span><span><strong>Manage Users</strong><small>Approve accounts and assign workspace roles</small></span><span aria-hidden="true">›</span></a>
        <button class="more-menu-item" type="button" data-help-guide><span class="more-menu-icon" aria-hidden="true">?</span><span><strong>Help Guide</strong><small>Installation, account and app menu overview</small></span><span aria-hidden="true">›</span></button>
        <button class="more-menu-item" type="button" data-theme-toggle aria-pressed="false"><span class="more-menu-icon" data-theme-icon aria-hidden="true">☀</span><span><strong>Theme</strong><small data-theme-description>Light appearance</small></span><span class="theme-switch" aria-hidden="true"></span></button>
      </div>
    </dialog>`);
  return $('moreMenuDialog', root);
}

export function setupAppShell({ root = document, home = false } = {}) {
  renderHeaderControls(root);
  const dialog = renderAppMenu(root, { home });
  const dialogController = setupDialog(dialog, { closeButtons: [$('closeMoreMenuDialog', root)] });
  root.querySelectorAll('[data-more-menu]').forEach((control) => {
    if (control.dataset.appMenuBound) return;
    control.dataset.appMenuBound = 'true';
    control.addEventListener('click', () => dialogController.open(control));
  });
  window.SPVTheme?.bindThemeControls(dialog);
  window.SPVHelpGuide?.bindTriggers(dialog);
  window.dispatchEvent(new CustomEvent('spv-admin-menu-rendered'));
  return {
    connectionStatus: $('connectionStatus', root), accountButton: $('accountBtn', root),
    installButton: $('installBtn', root), menuDialog: dialog, menuDialogController: dialogController
  };
}
