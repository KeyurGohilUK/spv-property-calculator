import { renderSyncStatus } from '../../components/sync-status.js';
import { escapeHtml, formatDate as formatSharedDate } from '../../utils/format-utils.js';

const $ = (id) => document.getElementById(id);
let currentUserId = '';
let users = [];
let loading = false;

function formatDate(value) {
  if (!value) return 'Never';
  return formatSharedDate(value, { dateStyle: 'medium' }, 'Never');
}

function setMessage(message = '', isError = false) {
  const element = $('userManagementMessage');
  element.textContent = message;
  element.classList.toggle('error-text', isError);
}

function setSyncStatus(message, state = '') {
  renderSyncStatus($('userManagementSyncStatus'), message, state);
}

async function withTimeout(promise, message, timeoutMs = 12_000) {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function isPolicyCurrent(user) {
  return user.terms_version === '2026-08-26'
    && user.privacy_version === '2026-08-26'
    && user.disclaimer_version === '2026-08-26';
}

function updateCardSaveState(card) {
  if (!card) return;
  const role = card.querySelector('[data-user-role]');
  const active = card.querySelector('[data-user-active]');
  const button = card.querySelector('[data-save-user]');
  const dirty = role.value !== role.dataset.original || String(active.checked) !== active.dataset.original;
  card.classList.toggle('has-unsaved', dirty);
  button.disabled = button.dataset.saving === 'true' || !dirty || card.dataset.currentUser === 'true';
}

function renderUsers() {
  const activeCount = users.filter((user) => user.active).length;
  const approvalCount = users.length - activeCount;
  const policyPendingCount = users.filter((user) => !isPolicyCurrent(user)).length;
  $('userOverview').innerHTML = [
    ['Total users', users.length, 'Registered workspace accounts'],
    ['Active', activeCount, 'Can access the workspace'],
    ['Access pending', approvalCount, 'Awaiting administrator approval'],
    ['Policies pending', policyPendingCount, 'Need to accept current policies']
  ].map(([label, value, detail], index) => '<div class="user-overview-card ' + (index > 1 && value ? 'attention' : '') + '"><strong>' + value + '</strong><span>' + label + '</span><span>' + detail + '</span></div>').join('');

  $('userListEmpty').classList.toggle('hidden', users.length !== 0);
  const filteredUsers = users.filter((user) => userFilter !== 'attention' || !user.active || !isPolicyCurrent(user));
  $('userList').innerHTML = filteredUsers.map((user) => {
    const isCurrentUser = user.user_id === currentUserId;
    const role = ['viewer', 'editor', 'admin'].includes(user.role) ? user.role : 'viewer';
    const displayName = user.display_name || 'Unnamed user';
    const policyCurrent = isPolicyCurrent(user);
    const needsAttention = !user.active || !policyCurrent;
    const policyStatus = policyCurrent
      ? 'Policies accepted ' + formatDate(user.policy_accepted_at)
      : 'Policy acceptance pending';
    const accessStatus = user.active
      ? 'Active · Last sign-in ' + formatDate(user.last_sign_in_at)
      : 'Access pending approval';
    return '<article class="user-card ' + (needsAttention ? 'needs-attention ' : '') + (isCurrentUser ? 'user-card-current' : '') + '" data-user-id="' + escapeHtml(user.user_id) + '" data-current-user="' + isCurrentUser + '">' +
      '<div class="user-identity"><strong>' + escapeHtml(displayName) + (isCurrentUser ? ' (You)' : '') + '</strong>' +
      '<small>' + escapeHtml(user.email || 'No email address') + '</small>' +
      '<div class="user-meta"><span class="user-status-badge ' + (user.active ? 'active' : 'inactive') + '">' + escapeHtml(accessStatus) + '</span>' +
      '<span class="user-policy-badge ' + (policyCurrent ? 'accepted' : 'pending') + '">' + escapeHtml(policyStatus) + '</span></div></div>' +
      '<label class="field user-role-field"><span>Role</span><select data-user-role data-original="' + role + '" ' + (isCurrentUser ? 'disabled' : '') + '>' +
      '<option value="viewer" ' + (role === 'viewer' ? 'selected' : '') + '>Viewer</option>' +
      '<option value="editor" ' + (role === 'editor' ? 'selected' : '') + '>Editor</option>' +
      '<option value="admin" ' + (role === 'admin' ? 'selected' : '') + '>Admin</option></select></label>' +
      '<div class="user-access-controls"><label class="switch-row compact-switch user-active-control"><span><span class="switch-title">Active</span></span>' +
      '<input data-user-active data-original="' + String(Boolean(user.active)) + '" type="checkbox" role="switch" ' + (user.active ? 'checked' : '') + ' ' + (isCurrentUser ? 'disabled' : '') + '></label>' +
      '<button class="primary-btn user-save-btn" data-save-user type="button" ' + (isCurrentUser ? 'disabled' : '') + '>Save</button></div>' +
      '<span class="user-unsaved-note">Unsaved access changes</span></article>';
  }).join('') || (users.length ? '<div class="user-empty-filter">No users need attention.</div>' : '');

  document.querySelectorAll('[data-user-filter]').forEach((button) => {
    const selected = button.dataset.userFilter === userFilter;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.onclick = () => {
      userFilter = button.dataset.userFilter;
      renderUsers();
    };
  });
  $('userList').querySelectorAll('[data-user-role], [data-user-active]').forEach((input) => {
    input.addEventListener('change', () => updateCardSaveState(input.closest('[data-user-id]')));
  });
  $('userList').querySelectorAll('[data-save-user]').forEach((button) => {
    button.addEventListener('click', () => saveUser(button.closest('[data-user-id]')));
  });
}

async function loadUsers() {
  if (loading) return false;
  loading = true;
  setSyncStatus('Loading users…');
  setMessage('');
  try {
    users = await withTimeout(window.SPVCloud.listWorkspaceUsers(), 'User list request timed out. Check your connection and try again.');
    renderUsers();
    setSyncStatus('Users up to date', 'synced');
    return true;
  } catch (error) {
    const message = error.message || 'Could not load workspace users.';
    setSyncStatus('User sync failed', 'error');
    setMessage(message, true);
    return false;
  } finally {
    loading = false;
  }
}

async function saveUser(card) {
  const userId = card?.dataset.userId;
  if (!userId || userId === currentUserId) return;
  const button = card.querySelector('[data-save-user]');
  const role = card.querySelector('[data-user-role]').value;
  const active = card.querySelector('[data-user-active]').checked;
  button.disabled = true;
  button.dataset.saving = 'true';
  button.textContent = 'Saving…';
  setSyncStatus('Saving changes…');
  setMessage('');
  try {
    await withTimeout(window.SPVCloud.setWorkspaceUserAccess(userId, role, active), 'Access update timed out. Check your connection and try again.');
    const refreshed = await loadUsers();
    if (refreshed) setMessage('User access updated.');
    else setMessage('Access updated, but the latest user list could not be loaded.', true);
  } catch (error) {
    setSyncStatus('User sync failed', 'error');
    setMessage(error.message || 'Could not update user access.', true);
  } finally {
    button.dataset.saving = 'false';
    button.textContent = 'Save';
    updateCardSaveState(card);
  }
}

function showDenied(message) {
  setSyncStatus('Access unavailable', 'error');
  $('userAccessLoading').classList.add('hidden');
  $('userManagementContent').classList.add('hidden');
  $('userAccessDenied').classList.remove('hidden');
  if (message) $('userAccessDeniedMessage').textContent = message;
}

async function initialise() {
  setSyncStatus('Checking access…');
  const cloud = window.SPVCloud;
  if (!cloud) {
    showDenied('Cloud account services are unavailable.');
    return;
  }
  try {
    const state = await withTimeout(cloud.init(), 'Account check timed out. Check your connection and try again.');
    const user = state.user || null;
    if (!user) {
      showDenied('Sign in with an administrator account to manage users.');
      return;
    }
    const access = await withTimeout(cloud.getWorkspaceAccess(), 'Administrator check timed out. Check your connection and try again.');
    if (!access?.active || access.role !== 'admin') {
      showDenied('Only an active administrator can manage workspace users.');
      return;
    }
    currentUserId = user.id;
    $('userAccessLoading').classList.add('hidden');
    $('userAccessDenied').classList.add('hidden');
    $('userManagementContent').classList.remove('hidden');
    await loadUsers();
  } catch (error) {
    showDenied(error.message || 'Administrator access could not be verified.');
  }
}

initialise();
