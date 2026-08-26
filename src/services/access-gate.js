export function renderAccessState(user, { root = document } = {}) {
  const authenticated = Boolean(user);
  root.body.classList.remove('auth-pending', 'auth-anonymous', 'auth-authenticated');
  root.body.classList.add(authenticated ? 'auth-authenticated' : 'auth-anonymous');

  const landing = root.getElementById('publicLanding');
  if (landing) {
    landing.hidden = authenticated;
    landing.setAttribute('aria-hidden', String(authenticated));
  }

  return authenticated;
}

export function redirectAnonymousToLanding(user, { home = './' } = {}) {
  if (user) return false;
  window.location.replace(home);
  return true;
}
