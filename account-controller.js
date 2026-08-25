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
  getDisplayName = (user) => user?.user_metadata?.display_name || user?.email || '',
  onDisplayNameSaved = () => {},
  onRender = () => {}
} = {}) {
  let user = null;
  let busy = false;

  const setBusy = (value) => {
    busy = Boolean(value);
    [elements.signInButton, elements.signUpButton, elements.signOutButton,
      elements.syncButton, elements.saveDisplayNameButton]
      .filter(Boolean)
      .forEach((button) => { button.disabled = busy || (button === elements.syncButton && (!navigator.onLine || isSyncing())); });
  };

  const render = () => {
    const state = cloud?.getConfigState?.() || { configured: false, available: false };
    const configured = Boolean(state.configured && state.available);
    setHidden(elements.notConfigured, configured);
    setHidden(elements.signedOut, !configured || Boolean(user));
    setHidden(elements.signedIn, !configured || !user);
    elements.button?.classList.toggle('is-signed-in', Boolean(user));
    elements.button?.classList.toggle('needs-attention', !configured);
    setButtonLabel(elements.button, !state.configured ? 'Cloud setup required' : !state.available ? 'Cloud unavailable' : user ? 'Account' : 'Sign in');

    if (!configured && elements.setupMessage && state.configured && !state.available) {
      elements.setupMessage.textContent = 'Supabase is configured, but the browser library is unavailable. Check your internet connection and reload the page.';
    }
    if (user) {
      elements.signedInEmail.textContent = user.email || 'Signed-in user';
      if (elements.displayNameInput) {
        const displayName = getDisplayName(user);
        elements.displayNameInput.value = displayName === user.email ? '' : displayName;
      }
      elements.syncButton.disabled = busy || isSyncing() || !navigator.onLine;
      elements.syncButton.textContent = isSyncing() ? 'Syncing…' : 'Sync now';
    }
    onRender({ user, state, busy });
  };

  const applyUser = async (nextUser, reason) => {
    user = nextUser || null;
    render();
    await onUserChange(user, { reason });
  };

  const signIn = async () => {
    const email = elements.email.value.trim();
    const password = elements.password.value;
    const validation = validateAccountCredentials(email, password);
    if (validation) { elements.authMessage.textContent = validation; return; }
    setBusy(true);
    elements.authMessage.textContent = 'Signing in…';
    try {
      const data = await cloud.signIn(email, password);
      await applyUser(data?.user || data?.session?.user || cloud.getCurrentUser?.(), 'sign-in');
      elements.authMessage.textContent = '';
      elements.password.value = '';
    } catch (error) {
      elements.authMessage.textContent = error.message || 'Could not sign in.';
    } finally {
      setBusy(false);
      render();
    }
  };

  const signUp = async () => {
    const email = elements.email.value.trim();
    const password = elements.password.value;
    const validation = validateAccountCredentials(email, password, true);
    if (validation) { elements.authMessage.textContent = validation; return; }
    setBusy(true);
    elements.authMessage.textContent = 'Creating account…';
    try {
      const data = await cloud.signUp(email, password, elements.name?.value.trim() || '');
      const signedInUser = data?.session?.user || null;
      if (signedInUser) {
        await applyUser(signedInUser, 'sign-up');
        elements.authMessage.textContent = '';
        elements.password.value = '';
      } else {
        elements.authMessage.textContent = 'Account created. Confirm your email, then sign in.';
      }
    } catch (error) {
      elements.authMessage.textContent = error.message || 'Could not create the account.';
    } finally {
      setBusy(false);
      render();
    }
  };

  const signOut = async () => {
    setBusy(true);
    if (elements.accountMessage) elements.accountMessage.textContent = 'Signing out…';
    try {
      await cloud.signOut();
      await applyUser(null, 'sign-out');
      elements.dialog.close();
    } catch (error) {
      if (elements.accountMessage) elements.accountMessage.textContent = error.message || 'Could not sign out.';
    } finally {
      setBusy(false);
      render();
    }
  };

  const saveDisplayName = async () => {
    const name = elements.displayNameInput?.value.trim() || '';
    if (!name) { elements.accountMessage.textContent = 'Enter your name first.'; return; }
    setBusy(true);
    elements.accountMessage.textContent = 'Saving name…';
    try {
      const updatedUser = await cloud.updateDisplayName(name);
      await applyUser(updatedUser, 'profile');
      elements.accountMessage.textContent = 'Display name saved. New notes will use this name.';
      await onDisplayNameSaved(updatedUser);
    } catch (error) {
      elements.accountMessage.textContent = error.message || 'Could not save your display name.';
    } finally {
      setBusy(false);
      render();
    }
  };

  const dialogController = setupDialog(elements.dialog, {
    closeButtons: [elements.closeButton],
    label: 'Account',
    initialFocus: () => elements.signedOut.classList.contains('hidden') ? elements.syncButton : elements.name
  });
  elements.button.addEventListener('click', () => { render(); dialogController.open(elements.button); });
  elements.signInButton.addEventListener('click', signIn);
  elements.signUpButton.addEventListener('click', signUp);
  elements.signOutButton.addEventListener('click', signOut);
  elements.syncButton.addEventListener('click', () => sync?.());
  elements.saveDisplayNameButton?.addEventListener('click', saveDisplayName);
  elements.password.addEventListener('keydown', (event) => { if (event.key === 'Enter') signIn(); });

  const initialise = async () => {
    if (!cloud) { render(); onInitialisationError(new Error('Cloud client unavailable.')); return; }
    cloud.onAuthChange((nextUser) => window.setTimeout(() => applyUser(nextUser, 'auth-change'), 0));
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
  return { initialise, render, open: () => { render(); dialogController.open(elements.button); }, getUser: () => user, signIn, signUp, signOut };
}
import { setupDialog } from './dialog-helper.js';
