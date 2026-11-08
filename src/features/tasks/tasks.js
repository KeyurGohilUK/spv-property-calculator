import { getIconSvg } from '../../components/shared-icons.js';
import { renderSyncStatus } from '../../components/sync-status.js';
import { renderChatThread, setChatComposerMode } from '../../components/chat-thread.js';
import { setupDialog } from '../../components/dialog-helper.js';
import { buildSafeRichText } from '../../utils/rich-text.js';
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

const STATUS_LABELS = { todo: 'Todo', 'in-progress': 'In Progress', resolved: 'Resolved', done: 'Done' };
const STATUS_ICONS = { todo: 'statusTodo', 'in-progress': 'statusProgress', resolved: 'statusResolved', done: 'statusDone' };

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
let boardSortables = [];
const MEMBER_COLORS = ['blue', 'rose', 'mint', 'amber', 'violet', 'teal'];
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
  $('openTaskSettingsBtn').classList.toggle('hidden', userRole !== 'admin');
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

// Editors may claim someone else's unassigned Todo, but not edit or delete it.
function canClaimTask(task) {
  return canEdit && Boolean(cloudUser?.id) && task.status === 'todo' && !task.assignedTo;
}
function canMoveTask(task, destination) {
  return canEditTask(task) || (canClaimTask(task) && destination === 'in-progress');
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
  render();
  if ($('taskSettingsDialog').open) renderTaskMemberColours();
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
  'in-progress': 'In Progress',
  resolved: 'Resolved',
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
    messages: [...comments].sort((a, b) => {
      const aTime = Date.parse(a.createdAt || '') || 0;
      const bTime = Date.parse(b.createdAt || '') || 0;
      return bTime - aTime;
    }),
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
  const canDrag = canEditTask(task) || canClaimTask(task);
  card.className = `task-card${task.status === 'done' ? ' is-done' : ''}${canDrag ? ' is-draggable' : ''}`;

  const member = workspaceMembers.find((item) => item.userId === task.assignedTo);
  if (member && MEMBER_COLORS.includes(member.taskColor)) card.dataset.memberColour = member.taskColor;

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'task-card-open';
  openBtn.setAttribute('aria-label', canEditTask(task) ? `Edit task: ${task.title}` : `View task: ${task.title}`);
  openBtn.addEventListener('click', () => openForm(task));

  // In the board, clicking the card opens it while the whole card remains the
  // SortableJS handle. Keep nested controls focused on their own actions.
  card.addEventListener('click', (event) => {
    if (event.target.closest('.task-card-open, .task-card-actions, .task-status-btn')) return;
    openForm(task);
  });

  const statusBtn = document.createElement('button');
  statusBtn.type = 'button';
  statusBtn.className = 'task-status-btn';
  statusBtn.dataset.status = task.status;
  statusBtn.innerHTML = getIconSvg(STATUS_ICONS[task.status] || STATUS_ICONS.todo);
  statusBtn.setAttribute('aria-label', `Mark as ${STATUS_LABELS[nextStatus(task.status)]}`);
  statusBtn.title = canEditTask(task)
    ? `Mark as ${STATUS_LABELS[nextStatus(task.status)]}`
    : 'Viewer accounts cannot change task status';
  statusBtn.disabled = !canMoveTask(task, nextStatus(task.status));
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
    deleteBtn.innerHTML = getIconSvg('trash');
    deleteBtn.setAttribute('aria-label', `Delete task: ${task.title}`);
    deleteBtn.title = 'Delete task';
    deleteBtn.addEventListener('click', () => removeTask(task));
    actions.appendChild(deleteBtn);
  }

  // Native select remains usable by keyboard and assistive technology.
  const statusSelect = document.createElement('select');
  statusSelect.className = 'task-card-status-select';
  statusSelect.setAttribute('aria-label', `Status for ${task.title}`);
  statusSelect.title = 'Change task status';
  statusSelect.disabled = !(canEditTask(task) || canClaimTask(task));
  STATUS_GROUP_ORDER.filter((status) => canEditTask(task) || status === task.status || status === 'in-progress').forEach((status) => {
    const option = document.createElement('option');
    option.value = status;
    option.textContent = STATUS_LABELS[status];
    statusSelect.appendChild(option);
  });
  statusSelect.value = task.status;
  statusSelect.addEventListener('change', () => changeTaskStatus(task, statusSelect.value));
  actions.prepend(statusSelect);

  card.append(openBtn, statusBtn, main, actions);
  return card;
}

const STATUS_GROUP_ORDER = ['todo', 'in-progress', 'resolved', 'done'];

function changeTaskStatus(task, newStatus) {
  if (!canMoveTask(task, newStatus) || !STATUS_GROUP_ORDER.includes(newStatus) || task.status === newStatus) {
    render();
    return;
  }
  try {
    const updated = updateTaskStatus(task.id, newStatus, cloudUser?.id || null);
    if (!updated) throw new Error('Task no longer exists.');
    addTaskEvent({ taskId: task.id, userId: cloudUser?.id || null, displayName: getActorName(), fromStatus: task.status, toStatus: newStatus });
    render();
    syncTasks({ showFeedback: false });
    checkViewingSuggestion(task, newStatus);
  } catch (error) {
    setSyncStatus(error.message || 'Unable to update task status', 'error');
    render();
  }
}

function setupBoardDragAndDrop() {
  boardSortables.forEach((sortable) => sortable.destroy());
  boardSortables = [];
  if (!canEdit || !window.Sortable) return;

  document.querySelectorAll('.task-board-column-items').forEach((column) => {
    boardSortables.push(window.Sortable.create(column, {
      group: 'spv-tasks',
      animation: 160,
      handle: '.task-card',
      draggable: '.task-card.is-draggable',
      filter: '.task-card-actions, .task-status-btn, .task-card-status-select',
      preventOnFilter: false,
      ghostClass: 'task-drag-ghost',
      chosenClass: 'task-drag-chosen',
      delayOnTouchOnly: false,
      delay: 220,
      touchStartThreshold: 4,
      onEnd(event) {
        const task = getTasks().find((item) => item.id === event.item?.dataset.taskId);
        const destination = event.to?.dataset.status;
        if (task && destination && destination !== task.status) {
          changeTaskStatus(task, destination);
        } else {
          render();
        }
      }
    }));
  });
}

function render() {
  const tasks = getTasks().filter(taskMatchesFilter);
  $('taskCount').textContent = String(tasks.length);
  $('taskEmpty').classList.toggle('hidden', tasks.length > 0);
  updateFilterBadge();

  boardSortables.forEach((sortable) => sortable.destroy());
  boardSortables = [];
  const list = $('taskList');
  list.innerHTML = '';
  STATUS_GROUP_ORDER.forEach((status) => {
    const group = document.createElement('section');
    group.className = 'task-board-column';
    group.setAttribute('aria-label', STATUS_LABELS[status]);

    const header = document.createElement('div');
    header.className = 'task-board-column-header';
    const name = document.createElement('strong');
    name.textContent = STATUS_LABELS[status];
    const count = document.createElement('span');
    count.className = 'count-badge';
    const groupTasks = tasks.filter((task) => task.status === status);
    count.textContent = String(groupTasks.length);
    header.append(name, count);

    const items = document.createElement('div');
    items.className = 'task-board-column-items';
    items.dataset.status = status;
    groupTasks.forEach((task) => {
      const card = buildTaskCard(task, { showStatus: false });
      card.dataset.taskId = task.id;
      items.appendChild(card);
    });
    group.append(header, items);
    list.appendChild(group);
  });
  setupBoardDragAndDrop();
}

function cycleStatus(task) {
  changeTaskStatus(task, nextStatus(task.status));
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

const taskSettingsDialogController = setupDialog($('taskSettingsDialog'), {
  closeButtons: [$('closeTaskSettingsBtn')]
});

function renderTaskMemberColours() {
  const list = $('taskMemberColours');
  list.replaceChildren();
  workspaceMembers.forEach((member) => {
    const row = document.createElement('div');
    row.className = 'task-member-colour-row';
    const name = document.createElement('strong');
    name.textContent = member.displayName || 'Workspace member';
    const picker = document.createElement('div');
    picker.className = 'task-member-colour-picker';
    const swatch = document.createElement('span');
    swatch.className = 'task-member-colour-swatch';
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Task colour for ' + name.textContent);
    [['', 'No colour'], ...MEMBER_COLORS.map((color) => [color, color[0].toUpperCase() + color.slice(1)])]
      .forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
      });
    select.value = member.taskColor || '';
    swatch.dataset.memberColour = select.value || 'none';
    select.addEventListener('change', async () => {
      const previous = member.taskColor || '';
      const next = select.value;
      select.disabled = true;
      $('taskSettingsMessage').textContent = 'Saving colour…';
      try {
        if (userRole !== 'admin' || !navigator.onLine) throw new Error('Sign in as an administrator and connect to update colours.');
        await window.SPVCloud.setTaskMemberColor(member.userId, next);
        member.taskColor = next || null;
        swatch.dataset.memberColour = next || 'none';
        localStorage.setItem(MEMBERS_CACHE_KEY, JSON.stringify(workspaceMembers));
        render();
        $('taskSettingsMessage').textContent = 'Colour saved for ' + name.textContent;
      } catch (error) {
        select.value = previous;
        $('taskSettingsMessage').textContent = error.message || 'Could not save colour.';
      } finally {
        select.disabled = false;
      }
    });
    picker.append(swatch, select);
    row.append(name, picker);
    list.appendChild(row);
  });
  if (!workspaceMembers.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No active members found. Connect to load workspace members.';
    list.appendChild(empty);
  }
}

$('openTaskSettingsBtn').addEventListener('click', async () => {
  if (userRole !== 'admin') return;
  $('taskSettingsMessage').textContent = '';
  renderTaskMemberColours();
  taskSettingsDialogController.open();
  await loadWorkspaceMembers();
});

function taskContentAsPlainText(value) {
  const holder = document.createElement('div');
  holder.append(buildSafeRichText(value || ''));
  holder.querySelectorAll('br').forEach((lineBreak) => lineBreak.replaceWith(document.createTextNode('\n')));
  holder.querySelectorAll('p, div, li, blockquote').forEach((block) => {
    if (block.nextSibling) block.after(document.createTextNode('\n'));
  });
  return holder.textContent
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function openForm(task = null, { preset = null } = {}) {
  if (!task && !canEdit) return;
  const readOnly = !!task && !canEditTask(task);
  editingTaskId = task?.id || null;
  $('taskForm').reset();
  $('taskDialogTitle').textContent = task ? (readOnly ? 'View Task' : 'Edit Task') : 'New Task';
  $('saveTaskBtn').textContent = 'Save';
  $('saveTaskBtn').classList.toggle('hidden', readOnly);
  $('cancelTaskBtn').textContent = readOnly ? 'Close' : 'Cancel';
  $('taskTitle').value = task?.title ?? preset?.title ?? '';
  $('taskDescription').value = task?.description || '';
  $('taskStatus').value = task?.status || 'todo';
  $('taskStatus').disabled = !task;
  $('taskDueDate').value = task?.dueDate || '';
  $('taskAssignedTo').value = task?.assignedTo || '';
  $('taskScope').value = task?.scope ?? preset?.scope ?? 'company';
  $('taskProperty').value = task?.propertyId ?? preset?.propertyId ?? '';
  $('taskSaveMessage').textContent = readOnly
    ? (userRole === 'viewer' ? 'You have read-only access to tasks' : 'You can only edit tasks you created')
    : '';
  ['taskTitle', 'taskDescription', 'taskStatus', 'taskDueDate', 'taskAssignedTo', 'taskScope', 'taskProperty'].forEach((id) => {
    $(id).disabled = readOnly || (id === 'taskStatus' && !task);
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
    value: taskContentAsPlainText(comment.message)
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
    const newStatus = existing ? $('taskStatus').value : 'todo';
    saveTask({
      ...existing,
      id: editingTaskId || undefined,
      title,
      description: $('taskDescription').value.trim(),
      status: newStatus,
      dueDate: $('taskDueDate').value || null,
      assignedTo: (existing?.status === 'todo' && newStatus === 'in-progress' && !$('taskAssignedTo').value)
        ? cloudUser?.id || null : $('taskAssignedTo').value || null,
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
