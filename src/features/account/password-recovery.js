import { setupPasswordField } from '../../components/password-field.js';
import { takeRecoveryEmail } from '../../services/password-recovery-email.js';

const requestForm = document.querySelector('#recovery-request');
const updateForm = document.querySelector('#recovery-update');
const heading = document.querySelector('#recovery-heading');
const status = document.querySelector('#recovery-status');
const redirectUrl = new URL('./?recovery=1', location.href);
let auth;
const hidePassword = setupPasswordField(updateForm.elements.password);
const hideConfirmation = setupPasswordField(updateForm.elements.confirmation);
const emailDraft = takeRecoveryEmail();

requestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  const email = new FormData(requestForm).get('email').trim();
  button.disabled = true;
  status.textContent = 'Requesting reset link…';
  try {
    auth ??= await window.SPVCloud.createPasswordRecoveryAuth();
    const { error } = await auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl.href,
    });
    if (error) throw error;
    status.textContent =
      'If an account exists for that email address, you’ll receive a reset link. Check your inbox and spam folder.';
  } catch {
    status.textContent = navigator.onLine
      ? 'We couldn’t request a reset link right now. Try again later or contact your workspace administrator.'
      : 'Connect to the internet to request a reset link.';
  } finally {
    button.disabled = false;
  }
});

updateForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hidePassword();
  hideConfirmation();
  const fields = new FormData(updateForm);
  const password = fields.get('password');
  if (password !== fields.get('confirmation')) {
    status.textContent = 'The passwords do not match.';
    updateForm.elements.confirmation.focus();
    return;
  }
  const button = event.submitter;
  button.disabled = true;
  status.textContent = 'Saving your new password…';
  try {
    const { error } = await auth.updateUser({ password });
    if (error) throw error;
    updateForm.reset();
    updateForm.hidden = true;
    document.querySelector('main a').focus();
    status.textContent =
      'Password updated. Return to sign in with your new password.';
  } catch (error) {
    if (error.status === 401 || error.code === 'session_not_found') {
      updateForm.reset();
      updateForm.hidden = true;
      requestForm.hidden = false;
      requestForm.elements.email.focus();
      status.textContent =
        'Your reset session has expired. Request a new reset link.';
    } else {
      status.textContent =
        error.code === 'weak_password' || error.code === 'same_password'
          ? 'Choose a stronger password that is different from your current password.'
          : 'We couldn’t save your password. Check your connection and try again.';
    }
  } finally {
    button.disabled = false;
  }
});

async function initialise() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const recoveryCallback = location.search || location.hash;
  if (!recoveryCallback) {
    requestForm.elements.email.value = emailDraft;
    requestForm.hidden = false;
    return;
  }

  // Strip credentials from the address bar before loading the SDK.
  history.replaceState(null, '', redirectUrl.pathname + redirectUrl.search);
  status.textContent = 'Checking your reset link…';
  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');

  try {
    if (fragment.get('type') !== 'recovery' || !accessToken || !refreshToken) {
      throw new Error('Missing recovery session.');
    }
    auth = await window.SPVCloud.createPasswordRecoveryAuth();
    const { data, error } = await auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error || !data.session)
      throw error || new Error('Missing recovery session.');
    heading.textContent = 'Choose a new password';
    status.textContent = '';
    updateForm.hidden = false;
    updateForm.elements.password.focus();
  } catch {
    requestForm.hidden = false;
    status.textContent = navigator.onLine
      ? 'This reset link is invalid or expired. Request a new reset link.'
      : 'Connect to the internet and reopen the reset link from your email.';
  }
}

initialise();
