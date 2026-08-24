import { renderSyncStatus } from './sync-status.js';

const $ = (id) => document.getElementById(id);
let currentUserId = '';
let users = [];
let loading = false;

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Never' : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(date);
}

function setMessage(message = '', isError = false) {
  const element = $('userManagementMessage');
  element.textContent = message;
  element.classList.toggle('error-text', isError);
}

function setSyncStatus(message, state = '') {
  renderSyncStatus($('userManagementSyncStatus'), message, state);
}

function renderSummary() {
  $('registeredUserCount').textContent = String(users.length);
  $('activeUserCount').textContent = String(users.filter((user) => user.active).length);
  $('adminUserCount').textContent = String(users.filter((user) => user.active && user.role === 'admin').length);
}

function renderUsers() {
  renderSummary();
  $('userListEmpty').classList.toggle('hidden', users.length !== 0);
  $('userList').innerHTML = users.map((user) => {
    const isCurrentUser = user.user_id === currentUserId;
    const role = ['viewer', 'editor', 'admin'].includes(user.role) ? user.role : 'viewer';
    const displayName = user.display_name || 'Unnamed user';
    return `<article class="user-card" data-user-id="${escapeHtml(user.user_id)}">
      <div class="user-identity">
        <strong>${escapeHtml(displayName)}${isCurrentUser ? ' (You)' : ''}</strong>
        <small>${escapeHtml(user.email || 'No email address')}</small>
        <span class="user-status-badge ${user.active ? 'active' : ''}">${user.active ? 'Active member' : 'Access not approved'} · Last sign-in ${escapeHtml(formatDate(user.last_sign_in_at))}</span>
      </div>
      <label class="field user-role-field"><span>Role</span>
        <select data-user-role ${isCurrentUser ? 'disabled' : ''}>
          <option value="viewer" ${role === 'viewer' ? 'selected' : ''}>Viewer</option>
          <option value="editor" ${role === 'editor' ? 'selected' : ''}>Editor</option>
          <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </label>
      <label class="switch-row compact-switch user-active-control">
        <span><span class="switch-title">Active</span></span>
        <input data-user-active type="checkbox" role="switch" ${user.active ? 'checked' : ''} ${isCurrentUser ? 'disabled' : ''}>
      </label>
      <button class="primary-btn user-save-btn" data-save-user type="button" ${isCurrentUser ? 'disabled' : ''}>Save</button>
    </article>`;
  }).join('');

  $('userList').querySelectorAll('[data-save-user]').forEach((button) => {
    button.addEventListener('click', () => saveUser(button.closest('[data-user-id]')));
  });
}

async function loadUsers() {
  if (loading) return;
  loading = true;
  setSyncStatus('Loading users…');
  setMessage('');
  try {
    users = await window.SPVCloud.listWorkspaceUsers();
    renderUsers();
    setSyncStatus('Users up to date', 'synced');
  } catch (error) {
    const message = error.message || 'Could not load workspace users.';
    setSyncStatus('User sync failed', 'error');
    setMessage(message, true);
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
  button.textContent = 'Saving…';
  setSyncStatus('Saving changes…');
  setMessage('');
  try {
    await window.SPVCloud.setWorkspaceUserAccess(userId, role, active);
    await loadUsers();
    setSyncStatus('Users up to date', 'synced');
    setMessage('User access updated.');
  } catch (error) {
    setSyncStatus('User sync failed', 'error');
    setMessage(error.message || 'Could not update user access.', true);
  } finally {
    button.disabled = false;
    button.textContent = 'Save';
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
    const state = await cloud.init();
    const user = state.user || null;
    if (!user) {
      showDenied('Sign in with an administrator account to manage users.');
      return;
    }
    const access = await cloud.getWorkspaceAccess();
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
