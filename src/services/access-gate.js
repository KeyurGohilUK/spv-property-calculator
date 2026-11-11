export function renderAccessState(user, { root = document } = {}) {
  const authenticated = Boolean(user);
  root.body.classList.remove(
    'auth-pending',
    'auth-anonymous',
    'auth-authenticated',
    'auth-policy-required',
  );
  root.body.classList.add(
    authenticated ? 'auth-authenticated' : 'auth-anonymous',
  );

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

// This cache permits local offline use only. Server RLS still controls every cloud request.
export async function requireWorkspaceMembership(
  user,
  { cloud, storage, online = navigator.onLine } = {},
) {
  const key = `spv-approved-workspace:${user.id}`;
  try {
    if (!online) return (storage || localStorage).getItem(key) === 'true';
    const access = await cloud.getWorkspaceAccess();
    const approved =
      access?.active === true &&
      ['viewer', 'editor', 'admin'].includes(access.role);
    try {
      const deviceStorage = storage || localStorage;
      if (approved) deviceStorage.setItem(key, 'true');
      else deviceStorage.removeItem(key);
    } catch {
      /* Online membership remains valid when device storage is unavailable. */
    }
    return approved;
  } catch {
    return false;
  }
}
