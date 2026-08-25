const ADMIN_LINK_SELECTOR = '[data-admin-users-link]';

function setAdminLinksVisible(visible) {
  document.querySelectorAll(ADMIN_LINK_SELECTOR).forEach((link) => {
    link.classList.toggle('hidden', !visible);
    link.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (visible) link.removeAttribute('tabindex');
    else link.setAttribute('tabindex', '-1');
  });
}

async function refreshAdminLinks(user) {
  setAdminLinksVisible(false);
  if (!user || !window.SPVCloud?.getWorkspaceAccess) return;
  try {
    const access = await window.SPVCloud.getWorkspaceAccess();
    setAdminLinksVisible(Boolean(access?.active && access.role === 'admin'));
  } catch (error) {
    console.warn('Could not check administrator menu access:', error);
  }
}

async function initialiseAdminMenu() {
  const cloud = window.SPVCloud;
  setAdminLinksVisible(false);
  if (!cloud) return;
  cloud.onAuthChange((user) => window.setTimeout(() => refreshAdminLinks(user), 0));
  try {
    const state = await cloud.init();
    await refreshAdminLinks(state.user || null);
  } catch (error) {
    console.warn('Administrator menu setup failed:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialiseAdminMenu, { once: true });
} else {
  initialiseAdminMenu();
}

window.addEventListener('spv-admin-menu-rendered', () => {
  refreshAdminLinks(window.SPVCloud?.getCurrentUser?.() || null);
});
