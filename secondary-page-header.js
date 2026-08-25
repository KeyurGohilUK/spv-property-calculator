import { setupInstallComponent } from './install-component.js';
import { setupAccountController } from './account-controller.js';
import { setupPrimaryNavigation } from './primary-navigation.js';
import { setupAppShell, closeOnBackdrop } from './app-shell.js';
import { syncWorkspace as syncWorkspaceData, formatWorkspaceSyncError } from './workspace-sync.js';

const $ = (id) => document.getElementById(id);
setupPrimaryNavigation();
const shell = setupAppShell();
let cloudUser = null;
let syncing = false;
let accountController = null;

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
  </dialog>`);

setupInstallComponent({ button: shell.installButton });

const updateConnection = () => {
  shell.connectionStatus.classList.toggle('offline', !navigator.onLine);
  const label = navigator.onLine ? 'Online' : 'Offline';
  shell.connectionStatus.setAttribute('aria-label', label);
  shell.connectionStatus.title = label;
  shell.connectionStatus.dataset.tooltip = label;
  accountController?.render();
};
window.addEventListener('online', updateConnection);
window.addEventListener('offline', updateConnection);
updateConnection();

closeOnBackdrop($('secondaryAccountDialog'));
accountController = setupAccountController({
  cloud: window.SPVCloud,
  elements: {
    button: shell.accountButton, dialog: $('secondaryAccountDialog'), closeButton: $('closeSecondaryAccount'),
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
