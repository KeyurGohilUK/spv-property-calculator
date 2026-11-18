import {
  setupAuthField,
  validateAuthEmail,
  validateAuthFields,
} from './auth-validation.js';
import { setupPasswordField } from '../components/password-field.js';
import { saveRecoveryEmail } from './password-recovery-email.js';
import {
  renderAccessState,
  requireWorkspaceMembership,
} from './access-gate.js';
function setHidden(element, hidden) {
  element?.classList.toggle('hidden', hidden);
}

function setButtonLabel(button, label) {
  if (!button) return;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.dataset.tooltip = label;
}

export function validateAccountCredentials(email, password, creating = false) {
  if (!String(email || '').trim() || !String(password || '')) {
    return creating
      ? 'Enter a valid email and a password of at least 6 characters.'
      : 'Enter your email and password.';
  }
  if (creating && String(password).length < 6) {
    return 'Enter a valid email and a password of at least 6 characters.';
  }
  return '';
}

export function setupAccountController({
  cloud,
  elements,
  sync,
  isSyncing = () => false,
  onUserChange = () => {},
  onInitialised = () => {},
  onInitialisationError = () => {},
  getDisplayName = (user) =>
    user?.user_metadata?.display_name || user?.email || '',
  onDisplayNameSaved = () => {},
  onRender = () => {},
} = {}) {
  let user = null;
  let busy = false;
  const hidePassword = setupPasswordField(elements.password);
  const emailField = setupAuthField(
    elements.email,
    'Enter your email address.',
    validateAuthEmail,
  );
  const passwordField = setupAuthField(
    elements.password,
    'Enter your password.',
  );
  const nameField =
    elements.displayNameInput &&
    setupAuthField(
      elements.displayNameInput,
      'Enter your display name.',
      (input) => (input.value.trim() ? '' : 'Enter your display name.'),
    );
  elements.dialog.addEventListener('close', hidePassword);
  elements.signedOut
    .querySelector('.auth-recovery-link')
    ?.addEventListener('click', () => {
      saveRecoveryEmail(elements.email.value.trim());
    });

  const setBusy = (value) => {
    busy = Boolean(value);
    [
      elements.signInButton,
      elements.signUpButton,
      elements.signOutButton,
      elements.syncButton,
      elements.saveDisplayNameButton,
    ]
      .filter(Boolean)
      .forEach((button) => {
        button.disabled =
          busy ||
          (button === elements.syncButton &&
            (!navigator.onLine || isSyncing()));
      });
  };

  const render = () => {
    const state = cloud?.getConfigState?.() || {
      configured: false,
      available: false,
    };
    const configured = Boolean(state.configured && state.available);
    setHidden(elements.notConfigured, configured);
    setHidden(elements.signedOut, !configured || Boolean(user));
    setHidden(elements.signedIn, !configured || !user);
    elements.button?.classList.toggle('is-signed-in', Boolean(user));
    elements.button?.classList.toggle('needs-attention', !configured);
    setButtonLabel(
      elements.button,
      !state.configured
        ? 'Cloud setup required'
        : !state.available
          ? 'Cloud unavailable'
          : user
            ? 'Account'
            : 'Sign in',
    );

    if (
      !configured &&
      elements.setupMessage &&
      state.configured &&
      !state.available
    ) {
      elements.setupMessage.textContent =
        'Supabase is configured, but the browser library is unavailable. Check your internet connection and reload the page.';
    }
    if (user) {
      elements.signedInEmail.textContent = user.email || 'Signed-in user';
      if (elements.displayNameInput) {
        const displayName = getDisplayName(user);
        elements.displayNameInput.value =
          displayName === user.email ? '' : displayName;
      }
      elements.syncButton.disabled = busy || isSyncing() || !navigator.onLine;
      elements.syncButton.textContent = isSyncing() ? 'Syncing…' : 'Sync now';
    }
    onRender({ user, state, busy });
  };

  const showAuthMessage = (message, isError = false) => {
    const output = elements.authMessage;
    output.classList.toggle('is-error', isError);
    output.textContent = message;
  };

  let accessRequest = 0;
  const applyUser = async (nextUser, reason) => {
    const request = ++accessRequest;
    const identityChanged = user?.id !== nextUser?.id;
    // A new identity must be verified before exposing any local workspace data.
    if (identityChanged || !nextUser) renderAccessState(null);
    if (!nextUser) {
      user = null;
      render();
      await onUserChange(null, { reason });
      return;
    }
    const approved = await requireWorkspaceMembership(nextUser, { cloud });
    if (request !== accessRequest) return;
    user = approved ? nextUser : null;
    if (!approved) renderAccessState(null);
    render();
    if (
      user &&
      (identityChanged || reason === 'sign-in' || reason === 'initialise')
    )
      dialogController.close();
    await onUserChange(user, { reason });
    if (!approved)
      showAuthMessage(
        'Workspace access requires an active, approved account. Contact your workspace administrator.',
        true,
      );
  };

  const signIn = async () => {
    if (busy) return;
    const email = elements.email.value.trim();
    const password = elements.password.value;
    hidePassword();
    showAuthMessage('');
    if (!validateAuthFields(emailField, passwordField)) return;
    setBusy(true);
    showAuthMessage('Signing in…');
    try {
      const data = await cloud.signIn(email, password);
      await applyUser(
        data?.user || data?.session?.user || cloud.getCurrentUser?.(),
        'sign-in',
      );
      if (user) showAuthMessage('');
      elements.password.value = '';
    } catch (error) {
      const invalidCredentials =
        error.code === 'invalid_credentials' ||
        error.message === 'Invalid login credentials';
      showAuthMessage(
        invalidCredentials
          ? 'Incorrect email or password. Check your details and try again.'
          : error.message || 'Could not sign in.',
        true,
      );
    } finally {
      setBusy(false);
      render();
    }
  };

  const signUp = async () => {
    const email = elements.email.value.trim();
    const password = elements.password.value;
    hidePassword();
    showAuthMessage('');
    if (!validateAuthFields(emailField, passwordField)) return;
    const validation = validateAccountCredentials(email, password, true);
    if (validation) {
      showAuthMessage(validation, true);
      return;
    }
    setBusy(true);
    showAuthMessage('Creating account…');
    try {
      const data = await cloud.signUp(
        email,
        password,
        elements.name?.value.trim() || '',
      );
      const signedInUser = data?.session?.user || null;
      if (signedInUser) {
        await applyUser(signedInUser, 'sign-up');
        showAuthMessage('');
        elements.password.value = '';
      } else {
        showAuthMessage('Account created. Confirm your email, then sign in.');
      }
    } catch (error) {
      showAuthMessage(error.message || 'Could not create the account.', true);
    } finally {
      setBusy(false);
      render();
    }
  };

  const signOut = async () => {
    setBusy(true);
    if (elements.accountMessage)
      elements.accountMessage.textContent = 'Signing out…';
    try {
      await cloud.signOut();
      await applyUser(null, 'sign-out');
      dialogController.close();
    } catch (error) {
      if (elements.accountMessage)
        elements.accountMessage.textContent =
          error.message || 'Could not sign out.';
    } finally {
      setBusy(false);
      render();
    }
  };

  const saveDisplayName = async () => {
    const name = elements.displayNameInput?.value.trim() || '';
    elements.accountMessage.textContent = '';
    if (!nameField || !validateAuthFields(nameField)) return;
    setBusy(true);
    elements.accountMessage.textContent = 'Saving name…';
    try {
      const updatedUser = await cloud.updateDisplayName(name);
      await applyUser(updatedUser, 'profile');
      elements.accountMessage.textContent =
        'Display name saved. New notes will use this name.';
      await onDisplayNameSaved(updatedUser);
    } catch (error) {
      elements.accountMessage.textContent =
        error.message || 'Could not save your display name.';
    } finally {
      setBusy(false);
      render();
    }
  };

  const dialogController = setupDialog(elements.dialog, {
    closeButtons: [elements.closeButton],
    label: 'Account',
    initialFocus: () =>
      elements.signedOut.classList.contains('hidden')
        ? elements.syncButton
        : elements.name,
  });
  elements.button.addEventListener('click', () => {
    render();
    dialogController.open(elements.button);
  });
  elements.signInButton.addEventListener('click', signIn);
  elements.signUpButton?.addEventListener('click', signUp);
  elements.signOutButton.addEventListener('click', signOut);
  elements.syncButton.addEventListener('click', () => sync?.());
  elements.saveDisplayNameButton?.addEventListener('click', saveDisplayName);
  for (const input of [elements.email, elements.password]) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) signIn();
    });
  }

  const initialise = async () => {
    if (!cloud) {
      render();
      onInitialisationError(new Error('Cloud client unavailable.'));
      return;
    }
    cloud.onAuthChange((nextUser) => {
      // The explicit sign-in/out operation already applies its resulting session.
      if (busy && nextUser) return;
      window.setTimeout(() => applyUser(nextUser, 'auth-change'), 0);
    });
    try {
      const state = await cloud.init();
      await applyUser(state.user || null, 'initialise');
      await onInitialised(state);
    } catch (error) {
      console.warn('Account setup failed:', error);
      onInitialisationError(error);
      render();
    }
  };

  render();
  return {
    initialise,
    render,
    open: () => {
      render();
      dialogController.open(elements.button);
    },
    getUser: () => user,
    signIn,
    signUp,
    signOut,
  };
}
import { setupDialog } from '../components/dialog-helper.js';
