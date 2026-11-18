const RECOVERY_EMAIL_KEY = 'spv-password-recovery-email';

export function saveRecoveryEmail(email) {
  try {
    if (email) sessionStorage.setItem(RECOVERY_EMAIL_KEY, email);
    else sessionStorage.removeItem(RECOVERY_EMAIL_KEY);
  } catch {
    // The reset form remains usable when browser storage is unavailable.
  }
}

export function takeRecoveryEmail() {
  try {
    const email = sessionStorage.getItem(RECOVERY_EMAIL_KEY);
    sessionStorage.removeItem(RECOVERY_EMAIL_KEY);
    return email || '';
  } catch {
    return '';
  }
}
