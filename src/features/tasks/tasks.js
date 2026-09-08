import { renderSyncStatus } from '../../components/sync-status.js';
import { renderChatThread, setChatComposerMode } from '../../components/chat-thread.js';
import { setupDialog } from '../../components/dialog-helper.js';
import { getActiveProperties } from '../properties/storage.js';
import { clearFieldValidation, setFieldValidation } from '../../utils/validation.js';
import { populateScopeFilterOptions } from '../../utils/scope-filter.js';
import { formatDate } from '../../utils/format-utils.js';
import {
  getTasks, getAllTasks, saveTask, updateTaskStatus, deleteTask, replaceTasks, nextStatus
} from './task-storage.js';
import { addTaskEvent, getTaskEvents } from './task-event-storage.js';
import { addTaskComment, getTaskComments, updateTaskComment } from './task-comment-storage.js';
import { syncTaskWorkspace } from './task-cloud-sync.js';
import { syncTaskEvents } from './task-event-sync.js';
import { syncTaskComments } from './task-comment-sync.js';
import { TEMPLATES, buildTasksFromTemplate } from './task-templates.js';

const $ = (id) => document.getElementById(id);

const STATUS_LABELS = { todo: 'To do', 'in-progress': 'In progress', done: 'Done' };
const STATUS_ICONS = {
  todo: '<circle cx="12" cy="12" r="9"></circle>',
  'in-progress': '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path>',
  done: '<circle cx="12" cy="12" r="9"></circle><path d="m8.5 12 2.5 2.5 4.5-4.5"></path>'
};

const MEMBERS_CACHE_KEY = 'spv-property-calculator.workspace-members.v1';

// Matches task titles that suggest a property viewing has taken place.
const VIEWING_RE = /\b(viewing|property[\s-]visit|site[\s-]visit|inspect)/i;

const VIEWING_SUGGESTIONS = [
  { title: 'Make offer', description: 'Prepare and submit a formal offer' },
  { title: 'Arrange second viewing', description: 'Book a follow-up visit to the property' },
  { title: 'Request lease pack', description: 'Ask the agent for the full lease documents' },
];

let properties = [];
let workspaceMembers = [];
let cloudUser = null;
let taskSyncing = false;
let cloudListenerAttached = false;
let editingTaskId = null;
let editingCommentId = null;
let selectedTemplateId = null;
let userRole = null;
let canEdit = false;
let suggestionSourceTask = null;
const suggestedTaskIds = new Set();

function setSyncStatus(message, state = '') {
  renderSyncStatus($('taskSyncStatus'), message, state);
}

async function syncTasks({ showFeedback = true } = {}) {
  const cloud = window.SPVCloud;
  if (!cloud || !cloudUser || !navigator.onLine) {
    if (!cloudUser) setSyncStatus('Saved on this device · sign in from Properties to sync');
    else if (!navigator.onLine) setSyncStatus('Offline · changes will sync later');
    return;
  }

  taskSyncing = true;
  setSyncStatus('Syncing tasks…');
  try {
    const result = await syncTaskWorkspace(cloud);
    await Promise.all([
      syncTaskEvents(cloud),
      syncTaskComments(cloud)
    ]);
    render();
    if (result.conflicts.length) {
      setSyncStatus(`${result.conflicts.length} task conflict${result.conflicts.length === 1 ? '' : 's'} kept locally · review before retrying`, 'error');
    } else {
      setSyncStatus(showFeedback ? 'Tasks synced' : 'Synced', 'synced');
    }
  } catch (error) {
    console.warn('Task sync failed:', error);
    const stage = error?.syncStage ? ` while ${error.syncStage}` : '';
    setSyncStatus(`Task sync pending${stage} · local changes are safe`, 'error');
  } finally {
    taskSyncing = false;
  }
}

async function setupTaskCloud() {
  const cloud = window.SPVCloud;
  if (!cloud) {
    setSyncStatus('Saved on this device · cloud unavailable');
    return;
  }
  if (!cloudListenerAttached) {
    cloud.onAuthChange((user) => {
      window.setTimeout(async () => {
        cloudUser = user || null;
        await refreshEditPermission();
        await loadWorkspaceMembers();
        if (cloudUser && navigator.onLine) syncTasks({ showFeedback: false });
        else setSyncStatus(cloudUser ? 'Offline · changes will sync later' : 'Saved on this device · sign in from Properties to sync');
      }, 0);
    });
    cloudListenerAttached = true;
  }
  try {
    const state = await cloud.init();
    cloudUser = state.user || null;
    await refreshEditPermission();
    await loadWorkspaceMembers();
    if (cloudUser && navigator.onLine) await syncTasks({ showFeedback: false });
    else setSyncStatus(cloudUser ? 'Offline · changes will sync later' : 'Saved on this device · sign in from Properties to sync');
  } catch (error) {
    console.warn('Task cloud setup failed:', error);
    setSyncStatus('Saved locally · cloud setup failed', 'error');
  }
}

async function refreshEditPermission() {
  const cloud = window.SPVCloud;
  if (!cloudUser || !cloud?.getWorkspaceAccess) {
    userRole = null;
    canEdit = false;
    applyEditState();
    return;
  }
  try {
    const access = await cloud.getWorkspaceAccess();
    userRole = (access?.active && ['viewer', 'editor', 'admin'].includes(access.role))
      ? access.role : null;
    canEdit = userRole === 'editor' || userRole === 'admin';
  } catch {
    userRole = null;
    canEdit = false;
  }
  applyEditState();
}

function applyEditState() {
  const tip = userRole === 'viewer' ? 'Viewer accounts cannot create tasks' : '';
  $('openTaskFormBtn').disabled = !canEdit;
  $('openTaskFormBtn').title = tip;
  $('openTemplateDialogBtn').disabled = !canEdit;
  $('openTemplateDialogBtn').title = tip;
  const badge = $('taskRoleBadge');
  if (userRole && cloudUser) {
    badge.textContent = { viewer: 'Read-only', editor: 'Editor', admin: 'Admin' }[userRole] || userRole;
    badge.className = `task-chip task-role-${userRole}`;
  } else {
    badge.className = 'task-chip hidden';
  }
}

function canEditTask(task) {
  if (!canEdit) return false;
  if (userRole === 'admin') return true;
  return !task.createdBy || task.createdBy === cloudUser?.id;
}

async function loadWorkspaceMembers() {
  const cloud = window.SPVCloud;
  const loadCached = () => {
    try {
      const raw = localStorage.getItem(MEMBERS_CACHE_KEY);
      workspaceMembers = Array.isArray(JSON.parse(raw || '[]')) ? JSON.parse(raw || '[]') : [];
    } catch { workspaceMembers = []; }
  };
  if (!cloud?.listActiveMembers || !cloudUser) {
    loadCached();
    populateAssigneeOptions();
    return;
  }
  try {
    workspaceMembers = await cloud.listActiveMembers();
    localStorage.setItem(MEMBERS_CACHE_KEY, JSON.stringify(workspaceMembers));
  } catch {
    loadCached();
  }
  populateAssigneeOptions();
}

function populateAssigneeOptions() {
  const formSelect = $('taskAssignedTo');
  const filterSelect = $('taskAssignedFilter');
  const savedFilter = filterSelect?.value || 'all';

  formSelect.innerHTML = '<option value="">Unassigned</option>';
  filterSelect.innerHTML = '<option value="all">Anyone</option>';

  if (cloudUser) {
    const meOpt = document.createElement('option');
    meOpt.value = 'me';
    meOpt.textContent = 'Assigned to me';
    filterSelect.appendChild(meOpt);
  }

  const unassignedOpt = document.createElement('option');
  unassignedOpt.value = 'unassigned';
  unassignedOpt.textContent = 'Unassigned';
  filterSelect.appendChild(unassignedOpt);

  workspaceMembers.forEach((m) => {
    const isMe = m.userId === cloudUser?.id;
    const formOpt = document.createElement('option');
    formOpt.value = m.userId;
    formOpt.textContent = isMe ? `${m.displayName} (you)` : m.displayName;
    formSelect.appendChild(formOpt);

    if (!isMe) {
      const filterOpt = document.createElement('option');
      filterOpt.value = m.userId;
      filterOpt.textContent = m.displayName;
      filterSelect.appendChild(filterOpt);
    }
  });

  const validValues = new Set(Array.from(filterSelect.options).map((o) => o.value));
  filterSelect.value = validValues.has(savedFilter) ? savedFilter : 'all';
}

function getActorName() {
  if (!cloudUser) return '';
  return window.SPVCloud?.getUserDisplayName?.() || cloudUser.email || '';
}

const STATUS_LABELS_FULL = {
  todo: 'To do',
  'in-progress': 'In progress',
  done: 'Done'
};

function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} days ago`;
  return formatDate(new Date(isoString));
}

function renderTaskHistory(taskId) {
  const events = getTaskEvents(taskId);
  const list = $('taskHistoryList');
  list.innerHTML = '';
  if (!events.length) {
    const empty = document.createElement('li');
    empty.className = 'task-history-empty';
    empty.textContent = 'No status changes recorded yet';
    list.appendChild(empty);
    return;
  }
  events.forEach((event) => {
    const item = document.createElement('li');
    item.className = 'task-history-item';

    const dot = document.createElement('span');
    dot.className = 'task-history-dot';
    dot.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    const toLabel = STATUS_LABELS_FULL[event.toStatus] || event.toStatus || '—';
    const who = event.userId && event.userId === cloudUser?.id
      ? 'You'
      : event.displayName || 'A workspace member';
    const when = formatRelativeTime(event.createdAt);

    const labelSpan = document.createElement('span');
    labelSpan.className = 'task-history-label';
    labelSpan.textContent = toLabel;

    text.append('Marked ', labelSpan, ` · ${who} · ${when}`);
    item.append(dot, text);
    list.appendChild(item);
  });
}

function renderTaskDiscussion(taskId) {
  const comments = getTaskComments(taskId);
  $('taskCommentCount').textContent = String(comments.length);
  renderChatThread({
    container: $('taskCommentList'),
    messages: comments,
    currentUserId: cloudUser?.id || null,
    getId: (comment) => comment.id,
    getAuthorId: (comment) => comment.userId,
    getAuthorName: (comment) => comment.displayName || 'Workspace member',
    getMessage: (comment) => comment.message,
    getCreatedAt: (comment) => comment.createdAt || '',
    getUpdatedAt: (comment) => comment.updatedAt || '',
    formatTimestamp: formatRelativeTime,
    onEdit: canEdit ? beginEditTaskComment : null,
    emptyDescription: 'Start the discussion about this task.'
  });
}

function populateProperties() {
  properties = getActiveProperties();
  populateScopeFilterOptions($('taskProperty'), $('taskFilter'), properties);
}

function updateScope() {
  const propertyScope = $('taskScope').value === 'property';
  $('taskPropertyField').classList.toggle('hidden', !propertyScope);
  $('taskProperty').required = propertyScope;
  if (!propertyScope) {
    $('taskProperty').value = '';
    clearFieldValidation($('taskProperty'), $('taskPropertyError'));
  }
}

function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function isOverdue(task) {
  return task.dueDate && task.status !== 'done' && task.dueDate < today();
}

function taskMatchesFilter(task) {
  const scope = $('taskFilter').value;
  if (scope === 'company' && task.scope !== 'company') return false;
  if (scope.startsWith('property:') && !(task.scope === 'property' && task.propertyId === scope.slice(9))) return false;

  const status = $('taskStatusFilter').value;
  if (status !== 'all' && task.status !== status) return false;

  const due = $('taskDueFilter').value;
  if (due !== 'all') {
    const t = today();
    const weekAhead = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    if (due === 'overdue' && !(task.dueDate && task.status !== 'done' && task.dueDate < t)) return false;
    if (due === 'due-soon' && !(task.dueDate && task.status !== 'done' && task.dueDate >= t && task.dueDate <= weekAhead)) return false;
    if (due === 'upcoming' && !(task.dueDate && task.dueDate > weekAhead)) return false;
    if (due === 'no-date' && task.dueDate) return false;
  }

  const assignee = $('taskAssignedFilter').value;
  if (assignee === 'me' && task.assignedTo !== cloudUser?.id) return false;
  if (assignee === 'unassigned' && task.assignedTo) return false;
  if (assignee !== 'all' && assignee !== 'me' && assignee !== 'unassigned' && task.assignedTo !== assignee) return false;

  return true;
}

function updateFilterBadge() {
  const active = ['taskFilter', 'taskStatusFilter', 'taskDueFilter', 'taskAssignedFilter']
    .filter((id) => $(id).value !== 'all').length;
  const btn = $('toggleTaskFiltersBtn');
  btn.textContent = active ? `Filter (${active})` : 'Filter';
}

function formatDueDate(dueDate) {
  if (!dueDate) return '';
  const parsed = new Date(`${dueDate}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? dueDate : formatDate(parsed);
}

function buildTaskCard(task, { showStatus = true } = {}) {
  const card = document.createElement('article');
  card.className = `task-card${task.status === 'done' ? ' is-done' : ''}`;

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'task-card-open';
  openBtn.setAttribute('aria-label', canEditTask(task) ? `Edit task: ${task.title}` : `View task: ${task.title}`);
  openBtn.addEventListener('click', () => openForm(task));

  const statusBtn = document.createElement('button');
  statusBtn.type = 'button';
  statusBtn.className = 'task-status-btn';
  statusBtn.dataset.status = task.status;
  statusBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${STATUS_ICONS[task.status] || STATUS_ICONS.todo}</svg>`;
  statusBtn.setAttribute('aria-label', `Mark as ${STATUS_LABELS[nextStatus(task.status)]}`);
  statusBtn.title = canEdit
    ? `Mark as ${STATUS_LABELS[nextStatus(task.status)]}`
    : 'Viewer accounts cannot change task status';
  statusBtn.disabled = !canEdit;
  statusBtn.addEventListener('click', () => cycleStatus(task));

  const main = document.createElement('div');
  main.className = 'task-card-main';

  const title = document.createElement('p');
  title.className = 'task-card-title';
  title.textContent = task.title;
  main.appendChild(title);

  if (task.description) {
    const desc = document.createElement('p');
    desc.className = 'task-card-description';
    desc.textContent = task.description;
    main.appendChild(desc);
  }

  const meta = document.createElement('div');
  meta.className = 'task-card-meta';

  if (showStatus) {
    const statusChip = document.createElement('span');
    statusChip.className = `task-chip ${task.status}`;
    statusChip.textContent = STATUS_LABELS[task.status] || task.status;
    meta.appendChild(statusChip);
  }

  if (task.dueDate) {
    const dueChip = document.createElement('span');
    dueChip.className = `task-chip${isOverdue(task) ? ' overdue' : ''}`;
    dueChip.textContent = `Due ${formatDueDate(task.dueDate)}`;
    meta.appendChild(dueChip);
  }

  if (task.assignedTo) {
    const assigneeChip = document.createElement('span');
    assigneeChip.className = 'task-chip task-chip-assignee';
    const member = workspaceMembers.find((m) => m.userId === task.assignedTo);
    assigneeChip.textContent = task.assignedTo === cloudUser?.id
      ? 'You'
      : member?.displayName || 'Assigned';
    meta.appendChild(assigneeChip);
  }

  if (task.scope === 'property' && task.propertyId) {
    const propertyChip = document.createElement('span');
    const prop = properties.find((p) => p.id === task.propertyId);
    propertyChip.className = 'task-chip';
    propertyChip.style.color = 'var(--brand)';
    propertyChip.textContent = prop?.title || 'Property';
    meta.appendChild(propertyChip);
  }

  main.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'task-card-actions';

  if (canEditTask(task)) {
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'task-delete-btn';
    deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="m6.5 7 .8 13h9.4l.8-13"></path><path d="M10 11v5M14 11v5"></path></svg>';
    deleteBtn.setAttribute('aria-label', `Delete task: ${task.title}`);
    deleteBtn.title = 'Delete task';
    deleteBtn.addEventListener('click', () => removeTask(task));
    actions.appendChild(deleteBtn);
  }

  card.append(openBtn, statusBtn, main, actions);
  return card;
}

const STATUS_GROUP_ORDER = ['in-progress', 'todo', 'done'];

function render() {
  const tasks = getTasks().filter(taskMatchesFilter);
  $('taskCount').textContent = String(tasks.length);
  $('taskEmpty').classList.toggle('hidden', tasks.length > 0);
  updateFilterBadge();

  const list = $('taskList');
  list.innerHTML = '';

  if ($('taskGroupBy').value === 'status') {
    const groups = Object.fromEntries(STATUS_GROUP_ORDER.map((s) => [s, []]));
    tasks.forEach((t) => { if (groups[t.status]) groups[t.status].push(t); });

    STATUS_GROUP_ORDER.forEach((status) => {
      const groupTasks = groups[status];
      if (!groupTasks.length) return;

      const group = document.createElement('div');
      group.className = 'task-group';

      const header = document.createElement('div');
      header.className = 'task-group-header';
      const chip = document.createElement('span');
      chip.className = `task-chip ${status}`;
      chip.textContent = STATUS_LABELS[status];
      const count = document.createElement('span');
      count.className = 'count-badge';
      count.textContent = String(groupTasks.length);
      header.append(chip, count);
      group.appendChild(header);

      groupTasks.forEach((task) => group.appendChild(buildTaskCard(task, { showStatus: false })));
      list.appendChild(group);
    });
  } else {
    tasks.forEach((task) => list.appendChild(buildTaskCard(task)));
  }
}

function cycleStatus(task) {
  if (!canEdit) return;
  const newStatus = nextStatus(task.status);
  const updated = updateTaskStatus(task.id, newStatus);
  if (updated) {
    addTaskEvent({ taskId: task.id, userId: cloudUser?.id || null, displayName: getActorName(), fromStatus: task.status, toStatus: newStatus });
    render();
    syncTasks({ showFeedback: false });
    checkViewingSuggestion(task, newStatus);
  }
}

function removeTask(task) {
  if (!canEditTask(task)) return;
  if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
  if (deleteTask(task.id)) {
    render();
    syncTasks({ showFeedback: false });
  }
}

function populateTemplateProperties() {
  const select = $('templateProperty');
  select.innerHTML = '<option value="">Select property</option>';
  properties.forEach((property) => {
    const option = document.createElement('option');
    option.value = property.id;
    option.textContent = property.title || 'Untitled property';
    select.appendChild(option);
  });
}

function renderTemplateCards() {
  const list = $('templateList');
  list.innerHTML = '';
  TEMPLATES.forEach((template) => {
    const card = document.createElement('div');
    card.className = 'template-card';
    card.dataset.templateId = template.id;

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'template-card-header';
    header.setAttribute('aria-expanded', 'false');

    const initial = document.createElement('div');
    initial.className = 'template-card-initial';
    initial.setAttribute('aria-hidden', 'true');
    initial.textContent = template.icon;

    const info = document.createElement('div');
    info.className = 'template-card-info';

    const name = document.createElement('strong');
    name.textContent = template.name;

    const chipRow = document.createElement('div');
    chipRow.className = 'template-card-meta';

    const scopeChip = document.createElement('span');
    scopeChip.className = 'task-chip';
    scopeChip.textContent = template.scope === 'property' ? 'Property' : 'Company';

    const countChip = document.createElement('span');
    countChip.className = 'task-chip';
    countChip.textContent = `${template.tasks.length} tasks`;

    const desc = document.createElement('p');
    desc.className = 'template-card-description';
    desc.textContent = template.description;

    chipRow.append(scopeChip, countChip);
    info.append(name, chipRow, desc);
    header.append(initial, info);
    header.addEventListener('click', () => selectTemplate(template.id));

    const taskList = document.createElement('ol');
    taskList.className = 'template-task-list hidden';
    template.tasks.forEach((taskDef) => {
      const item = document.createElement('li');
      item.textContent = taskDef.title;
      taskList.appendChild(item);
    });

    card.append(header, taskList);
    list.appendChild(card);
  });
}

function selectTemplate(id) {
  selectedTemplateId = selectedTemplateId === id ? null : id;
  const template = TEMPLATES.find((t) => t.id === selectedTemplateId);

  $('templateList').querySelectorAll('.template-card').forEach((card) => {
    const isSelected = card.dataset.templateId === selectedTemplateId;
    card.classList.toggle('is-selected', isSelected);
    card.querySelector('.template-task-list').classList.toggle('hidden', !isSelected);
    card.querySelector('.template-card-header').setAttribute('aria-expanded', String(isSelected));
  });

  const needsProperty = template?.scope === 'property';
  $('templatePropertyRow').classList.toggle('hidden', !needsProperty);
  if (!needsProperty) $('templateProperty').value = '';
  clearFieldValidation($('templateProperty'), $('templatePropertyError'));
  $('applyTemplateBtn').disabled = !template;
  $('applyTemplateBtn').textContent = template ? `Apply ${template.tasks.length} tasks` : 'Apply tasks';
  $('templateApplyMessage').textContent = '';
}

function openTemplateDialog() {
  if (!canEdit) return;
  selectedTemplateId = null;
  populateTemplateProperties();
  renderTemplateCards();
  $('templatePropertyRow').classList.add('hidden');
  $('templateProperty').value = '';
  $('applyTemplateBtn').disabled = true;
  $('applyTemplateBtn').textContent = 'Apply tasks';
  $('templateApplyMessage').textContent = '';
  templateDialogController.open();
}

function applyTemplateHandler() {
  if (!canEdit) return;
  const template = TEMPLATES.find((t) => t.id === selectedTemplateId);
  if (!template) return;

  const propertyId = template.scope === 'property' ? $('templateProperty').value : '';
  if (template.scope === 'property' && !propertyId) {
    setFieldValidation($('templateProperty'), $('templatePropertyError'), { invalid: true });
    $('templateProperty').focus();
    return;
  }

  const existing = getTasks().filter((t) => t.templateId === template.id
    && (template.scope === 'property' ? t.propertyId === propertyId : t.scope === 'company'));
  if (existing.length > 0) {
    const label = template.scope === 'property'
      ? (properties.find((p) => p.id === propertyId)?.title || 'this property')
      : 'the company';
    if (!window.confirm(`${existing.length} task${existing.length === 1 ? '' : 's'} from this template already exist for ${label}. Apply again?`)) return;
  }

  $('applyTemplateBtn').disabled = true;
  $('templateApplyMessage').textContent = 'Applying…';
  try {
    buildTasksFromTemplate(template.id, propertyId)
      .forEach((def) => saveTask({ ...def, createdBy: cloudUser?.id || null }));
    templateDialogController.close();
    render();
    syncTasks({ showFeedback: false });
  } catch (error) {
    $('templateApplyMessage').textContent = error.message || 'Could not apply this template.';
    $('applyTemplateBtn').disabled = false;
  }
}

function checkViewingSuggestion(task, newStatus) {
  if (newStatus !== 'done') return;
  if (suggestedTaskIds.has(task.id)) return;
  if (!VIEWING_RE.test(task.title || '')) return;
  suggestedTaskIds.add(task.id);
  suggestionSourceTask = task;
  $('suggestionTaskName').textContent = `"${task.title}"`;
  suggestionDialogController.open();
}

function applySuggestion(suggestionTitle) {
  if (!canEdit || !suggestionSourceTask) return;
  const source = suggestionSourceTask;
  suggestionDialogController.close();
  requestAnimationFrame(() => openForm(null, {
    preset: { title: suggestionTitle, scope: source.scope, propertyId: source.propertyId }
  }));
}

const suggestionDialogController = setupDialog($('suggestionDialog'), {
  closeButtons: [$('closeSuggestionDialogBtn'), $('dismissSuggestionBtn')]
});
$('suggestionDialog').addEventListener('close', () => { suggestionSourceTask = null; });
$('suggestionDialog').querySelectorAll('[data-suggestion]').forEach((btn) => {
  btn.addEventListener('click', () => applySuggestion(btn.dataset.suggestion));
});

const taskDialogController = setupDialog($('taskDialog'), {
  closeButtons: [$('closeTaskDialogBtn'), $('cancelTaskBtn')],
  initialFocus: () => $('taskTitle')
});
$('taskDialog').addEventListener('close', () => {
  editingTaskId = null;
  ['taskTitle', 'taskDescription', 'taskStatus', 'taskDueDate', 'taskAssignedTo', 'taskScope', 'taskProperty'].forEach((id) => {
    $(id).disabled = false;
  });
  $('saveTaskBtn').classList.remove('hidden');
  $('cancelTaskBtn').textContent = 'Cancel';
  resetCommentComposer();
  $('taskCommentMessage').textContent = '';
});

const templateDialogController = setupDialog($('templateDialog'), {
  closeButtons: [$('closeTemplateDialogBtn'), $('cancelTemplateBtn')],
});
$('templateDialog').addEventListener('close', () => { selectedTemplateId = null; });

function openForm(task = null, { preset = null } = {}) {
  if (!task && !canEdit) return;
  const readOnly = !!task && !canEditTask(task);
  editingTaskId = task?.id || null;
  $('taskForm').reset();
  $('taskDialogTitle').textContent = task ? (readOnly ? 'View Task' : 'Edit Task') : 'New Task';
  $('saveTaskBtn').textContent = task ? 'Save Changes' : 'Save Task';
  $('saveTaskBtn').classList.toggle('hidden', readOnly);
  $('cancelTaskBtn').textContent = readOnly ? 'Close' : 'Cancel';
  $('taskTitle').value = task?.title ?? preset?.title ?? '';
  $('taskDescription').value = task?.description || '';
  $('taskStatus').value = task?.status || 'todo';
  $('taskDueDate').value = task?.dueDate || '';
  $('taskAssignedTo').value = task?.assignedTo || '';
  $('taskScope').value = task?.scope ?? preset?.scope ?? 'company';
  $('taskProperty').value = task?.propertyId ?? preset?.propertyId ?? '';
  $('taskSaveMessage').textContent = readOnly
    ? (userRole === 'viewer' ? 'You have read-only access to tasks' : 'You can only edit tasks you created')
    : '';
  ['taskTitle', 'taskDescription', 'taskStatus', 'taskDueDate', 'taskAssignedTo', 'taskScope', 'taskProperty'].forEach((id) => {
    $(id).disabled = readOnly;
  });
  if (task) {
    renderTaskHistory(task.id);
    $('taskHistory').classList.remove('hidden');
    renderTaskDiscussion(task.id);
    $('taskDiscussion').classList.remove('hidden');
    $('taskCommentComposer').classList.toggle('hidden', !canEdit);
  } else {
    $('taskHistory').classList.add('hidden');
    $('taskDiscussion').classList.add('hidden');
  }
  clearFieldValidation($('taskTitle'), $('taskTitleError'));
  clearFieldValidation($('taskProperty'), $('taskPropertyError'));
  updateScope();
  taskDialogController.open();
}

function resetCommentComposer() {
  editingCommentId = null;
  setChatComposerMode({
    label: $('taskCommentLabel'),
    textarea: $('taskComment'),
    sendButton: $('addTaskCommentBtn'),
    cancelButton: $('cancelTaskCommentEditBtn')
  });
}

function beginEditTaskComment(comment) {
  if (!canEdit || !cloudUser || comment.userId !== cloudUser.id) return;
  editingCommentId = comment.id;
  setChatComposerMode({
    label: $('taskCommentLabel'),
    textarea: $('taskComment'),
    sendButton: $('addTaskCommentBtn'),
    cancelButton: $('cancelTaskCommentEditBtn'),
    editing: true,
    value: comment.message
  });
  $('taskCommentMessage').textContent = '';
  $('taskComment').focus();
  $('taskComment').setSelectionRange($('taskComment').value.length, $('taskComment').value.length);
}

function postTaskComment() {
  if (!editingTaskId || !canEdit) return;
  const message = $('taskComment').value.trim();
  if (!message) {
    $('taskCommentMessage').textContent = 'Enter a message.';
    $('taskComment').focus();
    return;
  }

  const button = $('addTaskCommentBtn');
  button.disabled = true;
  $('taskCommentMessage').textContent = editingCommentId ? 'Saving…' : 'Posting…';
  try {
    if (editingCommentId) {
      updateTaskComment(editingCommentId, message, cloudUser?.id || null);
      $('taskCommentMessage').textContent = navigator.onLine && cloudUser ? 'Message updated' : 'Update saved on this device';
    } else {
      addTaskComment({
        taskId: editingTaskId,
        userId: cloudUser?.id || null,
        displayName: getActorName(),
        message
      });
      $('taskCommentMessage').textContent = navigator.onLine && cloudUser ? 'Message sent' : 'Saved on this device';
    }
    resetCommentComposer();
    renderTaskDiscussion(editingTaskId);
    syncTasks({ showFeedback: false });
  } catch (error) {
    $('taskCommentMessage').textContent = error.message || 'Could not save this message.';
  } finally {
    button.disabled = false;
  }
}

function submitTask(event) {
  event.preventDefault();
  if (!canEdit) return;
  if (editingTaskId) {
    const check = getAllTasks().find((t) => t.id === editingTaskId);
    if (check && !canEditTask(check)) return;
  }

  const title = $('taskTitle').value.trim();
  const scope = $('taskScope').value;
  const propertyId = $('taskProperty').value;
  const titleInvalid = !title;
  const propertyInvalid = scope === 'property' && !propertyId;

  setFieldValidation($('taskTitle'), $('taskTitleError'), { invalid: titleInvalid });
  setFieldValidation($('taskProperty'), $('taskPropertyError'), { invalid: propertyInvalid });
  if (titleInvalid || propertyInvalid) return;

  const submit = $('taskForm').querySelector('[type="submit"]');
  submit.disabled = true;
  $('taskSaveMessage').textContent = 'Saving…';

  try {
    const existing = editingTaskId ? getAllTasks().find((t) => t.id === editingTaskId) : null;
    const newStatus = $('taskStatus').value;
    saveTask({
      ...existing,
      id: editingTaskId || undefined,
      title,
      description: $('taskDescription').value.trim(),
      status: newStatus,
      dueDate: $('taskDueDate').value || null,
      assignedTo: $('taskAssignedTo').value || null,
      scope,
      propertyId,
      createdBy: existing?.createdBy || cloudUser?.id || null
    });
    if (existing && existing.status !== newStatus) {
      addTaskEvent({ taskId: existing.id, userId: cloudUser?.id || null, displayName: getActorName(), fromStatus: existing.status, toStatus: newStatus });
    }
    const becameDone = existing && existing.status !== 'done' && newStatus === 'done';
    taskDialogController.close();
    render();
    syncTasks({ showFeedback: false });
    if (becameDone) checkViewingSuggestion({ id: editingTaskId, title, scope, propertyId }, newStatus);
  } catch (error) {
    $('taskSaveMessage').textContent = error.message || 'Could not save this task.';
  } finally {
    submit.disabled = false;
  }
}

$('openTaskFormBtn').addEventListener('click', () => openForm());
$('addTaskCommentBtn').addEventListener('click', postTaskComment);
$('cancelTaskCommentEditBtn').addEventListener('click', () => {
  resetCommentComposer();
  $('taskCommentMessage').textContent = '';
});
$('taskComment').addEventListener('input', () => { $('taskCommentMessage').textContent = ''; });
$('openTemplateDialogBtn').addEventListener('click', openTemplateDialog);
$('applyTemplateBtn').addEventListener('click', applyTemplateHandler);
$('taskScope').addEventListener('change', updateScope);
$('taskTitle').addEventListener('input', () => clearFieldValidation($('taskTitle'), $('taskTitleError')));
$('taskProperty').addEventListener('change', () => clearFieldValidation($('taskProperty'), $('taskPropertyError')));
$('taskForm').addEventListener('submit', submitTask);
$('taskFilter').addEventListener('change', render);
$('taskStatusFilter').addEventListener('change', render);
$('taskDueFilter').addEventListener('change', render);
$('taskAssignedFilter').addEventListener('change', render);
$('taskGroupBy').addEventListener('change', render);
$('toggleTaskFiltersBtn').addEventListener('click', () => {
  const opening = $('taskFilters').classList.contains('hidden');
  $('taskFilters').classList.toggle('hidden', !opening);
  $('toggleTaskFiltersBtn').setAttribute('aria-expanded', String(opening));
});
$('clearTaskFiltersBtn').addEventListener('click', () => {
  $('taskFilter').value = 'all';
  $('taskStatusFilter').value = 'all';
  $('taskDueFilter').value = 'all';
  $('taskAssignedFilter').value = 'all';
  $('taskGroupBy').value = 'none';
  render();
});
window.addEventListener('online', () => syncTasks({ showFeedback: false }));
window.addEventListener('offline', () => setSyncStatus('Offline · changes will sync later'));
window.addEventListener('spv-workspace-synced', () => {
  populateProperties();
  render();
});

populateProperties();
render();
setupTaskCloud();
