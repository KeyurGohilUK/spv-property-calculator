import { setupInstallComponent } from './install-component.js';
import { setupAccountController } from './account-controller.js';
import { syncWorkspace as syncWorkspaceData, formatWorkspaceSyncError } from './workspace-sync.js';
const $ = (id) => document.getElementById(id);
const header = document.querySelector('.header-inner');
let cloudUser = null;
let syncing = false;
let accountController = null;

function closeOnBackdrop(dialog) {
  dialog.addEventListener('click', (event) => {
    const bounds = dialog.getBoundingClientRect();
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right
      && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    if (!inside) dialog.close();
  });
}

async function syncWorkspace() {
  if (syncing || !cloudUser || !navigator.onLine) return;
  syncing = true;
  accountController?.render();
  $('secondaryAccountMessage').textContent = 'Syncing properties and expenses…';
  try {
    const result = await syncWorkspaceData(window.SPVCloud);
    $('secondaryAccountMessage').textContent = result.message;
    window.dispatchEvent(new CustomEvent('spv-workspace-synced'));
  } catch (error) {
    console.warn('Workspace sync failed:', error);
    $('secondaryAccountMessage').textContent = formatWorkspaceSyncError(error);
  } finally {
    syncing = false;
    accountController?.render();
  }
}

function renderAccount() {
  accountController?.render();
}

if (header && !header.querySelector('.header-actions')) {
  const actions = document.createElement('div');
  actions.className = 'header-actions';
  actions.setAttribute('aria-label', 'App controls');
  actions.innerHTML = `
    <span id="secondaryConnectionStatus" class="header-icon-control connection-icon" role="status" tabindex="0" aria-label="Online" title="Online" data-tooltip="Online">
      <svg class="connection-online-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9.5a10.2 10.2 0 0 1 14 0"></path><path d="M8 13a5.8 5.8 0 0 1 8 0"></path><path d="M10.8 16.3a1.8 1.8 0 0 1 2.4 0"></path><circle cx="12" cy="18.5" r="1"></circle></svg>
      <svg class="connection-offline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 4.5 19.5 19.5"></path><path d="M5 9.5a10.2 10.2 0 0 1 10.8-2.1"></path><path d="M18.8 10.7c.1.1.1.1.2.2"></path><path d="M8 13a5.8 5.8 0 0 1 3-1.5"></path><path d="M14.8 13.8c.4.2.8.5 1.2.8"></path><circle cx="12" cy="18.5" r="1"></circle></svg>
    </span>
    <button id="secondaryAccountBtn" class="header-icon-control" type="button" aria-label="Account" title="Account" data-tooltip="Account"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.25"></circle><path d="M5.5 19c.7-3.5 3-5.3 6.5-5.3s5.8 1.8 6.5 5.3"></path></svg></button>
    <button id="secondaryInstallBtn" class="header-icon-control" type="button" aria-label="Install app" title="Install app" data-tooltip="Install app"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v10"></path><path d="m8.5 10.5 3.5 3.5 3.5-3.5"></path><path d="M5 16.5v2.2c0 1 .8 1.8 1.8 1.8h10.4c1 0 1.8-.8 1.8-1.8v-2.2"></path></svg></button>`;
  header.appendChild(actions);

  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="secondaryAccountDialog" class="install-dialog auth-dialog">
      <button id="closeSecondaryAccount" class="dialog-close" type="button" aria-label="Close">×</button>
      <div id="secondarySignedOut"><p class="eyebrow">Cloud sync</p><h3>Supabase account</h3>
        <label class="field"><span>Your name</span><input id="secondaryAuthName" type="text" autocomplete="name" maxlength="80"></label>
        <label class="field"><span>Email</span><input id="secondaryAuthEmail" type="email" autocomplete="email"></label>
        <label class="field"><span>Password</span><input id="secondaryAuthPassword" type="password" autocomplete="current-password" minlength="6"></label>
        <div class="auth-actions"><button id="secondarySignInBtn" class="primary-btn" type="button">Sign in</button><button id="secondarySignUpBtn" class="secondary-btn" type="button">Create account</button></div>
        <p id="secondaryAuthMessage" class="auth-message" aria-live="polite"></p>
      </div>
      <div id="secondarySignedIn" class="hidden"><p class="eyebrow">Cloud sync</p><h3>Signed in</h3><p id="secondarySignedInEmail" class="muted"></p>
        <div class="auth-account-card"><strong>Supabase connected</strong><small>Properties and expenses share the same workspace.</small></div>
        <div class="auth-actions"><button id="secondarySyncBtn" class="primary-btn" type="button">Sync now</button><button id="secondarySignOutBtn" class="secondary-btn" type="button">Sign out</button></div>
        <p id="secondaryAccountMessage" class="auth-message" aria-live="polite"></p>
      </div>
      <div id="secondaryAuthSetup" class="hidden"><p class="eyebrow">Cloud sync</p><h3>Supabase setup required</h3><p>Configure the Project URL and Publishable key in <code>supabase-config.js</code>.</p></div>
    </dialog>
  `);

  setupInstallComponent({ button: $('secondaryInstallBtn') });

  const updateConnection = () => {
    const status = $('secondaryConnectionStatus');
    status.classList.toggle('offline', !navigator.onLine);
    const label = navigator.onLine ? 'Online' : 'Offline';
    status.setAttribute('aria-label', label); status.title = label; status.dataset.tooltip = label;
    accountController?.render();
  };
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
  updateConnection();

  closeOnBackdrop($('secondaryAccountDialog'));
  accountController = setupAccountController({
    cloud: window.SPVCloud,
    elements: {
      button: $('secondaryAccountBtn'), dialog: $('secondaryAccountDialog'), closeButton: $('closeSecondaryAccount'),
      signedOut: $('secondarySignedOut'), signedIn: $('secondarySignedIn'), notConfigured: $('secondaryAuthSetup'),
      setupMessage: $('secondaryAuthSetup').querySelector('p:not(.eyebrow)'),
      name: $('secondaryAuthName'), email: $('secondaryAuthEmail'), password: $('secondaryAuthPassword'),
      authMessage: $('secondaryAuthMessage'), signedInEmail: $('secondarySignedInEmail'),
      signInButton: $('secondarySignInBtn'), signUpButton: $('secondarySignUpBtn'), signOutButton: $('secondarySignOutBtn'),
      syncButton: $('secondarySyncBtn'), accountMessage: $('secondaryAccountMessage')
    },
    sync: syncWorkspace,
    isSyncing: () => syncing,
    onUserChange: async (user, { reason }) => {
      cloudUser = user;
      if (cloudUser && navigator.onLine && (reason === 'sign-in' || reason === 'sign-up')) await syncWorkspace();
    }
  });
  accountController.initialise();
}

const moreControl = document.querySelector('[data-more-menu]');
if (moreControl) {
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="secondaryMoreMenuDialog" class="install-dialog more-menu-dialog">
      <div class="more-menu-header"><h3>App Menu</h3><button id="closeSecondaryMoreMenu" class="icon-btn more-menu-close" type="button" aria-label="Close menu">×</button></div>
      <div class="more-menu-list">
        <a class="more-menu-item" href="./?view=archive"><span class="more-menu-icon" aria-hidden="true">↺</span><span><strong>Archived Properties</strong><small>Restore or permanently delete archived calculations</small></span><span aria-hidden="true">›</span></a>
        <a class="more-menu-item hidden" href="./manage-users.html" data-admin-users-link aria-hidden="true" tabindex="-1"><span class="more-menu-icon" aria-hidden="true">♙</span><span><strong>Manage Users</strong><small>Approve accounts and assign workspace roles</small></span><span aria-hidden="true">›</span></a>
        <button class="more-menu-item" type="button" data-help-guide><span class="more-menu-icon" aria-hidden="true">?</span><span><strong>Help Guide</strong><small>Installation, account and app menu overview</small></span><span aria-hidden="true">›</span></button>
        <button class="more-menu-item" type="button" data-theme-toggle aria-pressed="false"><span class="more-menu-icon" data-theme-icon aria-hidden="true">☀</span><span><strong>Theme</strong><small data-theme-description>Light appearance</small></span><span class="theme-switch" aria-hidden="true"></span></button>
      </div>
    </dialog>`);
  const dialog = $('secondaryMoreMenuDialog');
  window.SPVTheme?.bindThemeControls(dialog);
  window.SPVHelpGuide?.bindTriggers(dialog);
  moreControl.addEventListener('click', () => dialog.showModal());
  $('closeSecondaryMoreMenu').addEventListener('click', () => dialog.close());
  closeOnBackdrop(dialog);
}
