import assert from 'node:assert/strict';
import fs from 'node:fs';
import { findDueTasks, todayInLondon, addDays } from '../supabase/functions/task-reminders/schedule.js';

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value))
};

const { getTasks, getAllTasks, saveTask, updateTaskStatus, deleteTask, replaceTasks, nextStatus } = await import('../src/features/tasks/task-storage.js');
const { mergeTaskWorkspace } = await import('../src/features/tasks/task-cloud-sync.js');

const taskPage = fs.readFileSync(new URL('../src/features/tasks/tasks.js', import.meta.url), 'utf8');
const taskHtml = fs.readFileSync(new URL('../tasks/index.html', import.meta.url), 'utf8');
const cloud = fs.readFileSync(new URL('../cloud.js', import.meta.url), 'utf8');
const workspaceSync = fs.readFileSync(new URL('../src/services/workspace-sync.js', import.meta.url), 'utf8');

const { addTaskEvent, getTaskEvents, getAllTaskEvents } = await import('../src/features/tasks/task-event-storage.js');
const { addTaskComment, getTaskComments, getAllTaskComments } = await import('../src/features/tasks/task-comment-storage.js');

// Storage: create and retrieve
const task = saveTask({ title: 'Instruct solicitor', status: 'todo', scope: 'company' });
assert.ok(task.id, 'Saved task must have an ID');
assert.equal(task.title, 'Instruct solicitor');
assert.equal(task.status, 'todo');
assert.equal(task._cloudDirty, true, 'New task must be marked cloud dirty');
assert.equal(task.deletedAt, null);

// Storage: update status
const updated = updateTaskStatus(task.id, 'in-progress');
assert.equal(updated.status, 'in-progress');
assert.equal(updated._cloudDirty, true);

// Storage: next status cycling
assert.equal(nextStatus('todo'), 'in-progress');
assert.equal(nextStatus('in-progress'), 'done');
assert.equal(nextStatus('done'), 'todo');

// Storage: getTasks excludes soft-deleted
deleteTask(task.id);
assert.equal(getTasks().find((t) => t.id === task.id), undefined, 'Deleted task must not appear in getTasks');
assert.ok(getAllTasks().find((t) => t.id === task.id)?.deletedAt, 'Deleted task must remain in getAllTasks with deletedAt set');

// Storage: scope / propertyId handling
const propertyTask = saveTask({ title: 'Survey booked', scope: 'property', propertyId: 'prop-1' });
assert.equal(propertyTask.scope, 'property');
assert.equal(propertyTask.propertyId, 'prop-1');
const companyTask = saveTask({ title: 'Annual accounts', scope: 'company' });
assert.equal(companyTask.propertyId, '', 'Company tasks must have empty propertyId');

// Storage: replaceTasks round-trips correctly
replaceTasks([companyTask]);
assert.equal(getTasks().length, 1);
assert.equal(getTasks()[0].title, 'Annual accounts');

// Storage: active work is surfaced first without changing the status cycle
replaceTasks([
  { id: 'todo-first', title: 'Queued', status: 'todo', updatedAt: '2025-01-01T00:00:00Z' },
  { id: 'done-last', title: 'Finished', status: 'done', updatedAt: '2025-01-03T00:00:00Z' },
  { id: 'active-top', title: 'Active', status: 'in-progress', updatedAt: '2025-01-02T00:00:00Z' }
]);
assert.deepEqual(getTasks().map((item) => item.id), ['active-top', 'todo-first', 'done-last']);

// Merge: cloud-only record is added locally
const local1 = { id: 'a', title: 'Local', status: 'todo', updatedAt: '2024-01-01T00:00:00Z', _cloudDirty: false, _cloudRevision: 1 };
const cloud1 = { id: 'b', title: 'Cloud', status: 'done', updatedAt: '2024-01-02T00:00:00Z', _cloudDirty: false, _cloudRevision: 1 };
const merge1 = mergeTaskWorkspace([local1], [cloud1]);
assert.ok(merge1.merged.has('a'), 'Local-only record must survive merge');
assert.ok(merge1.merged.has('b'), 'Cloud-only record must be added');
assert.equal(merge1.upload.find((r) => r.id === 'a')?.id, 'a', 'Local-only record must be queued for upload');

// Merge: dirty local beats clean cloud at same revision
const dirty = { id: 'c', title: 'Dirty local', status: 'in-progress', updatedAt: '2024-01-01T00:00:00Z', _cloudDirty: true, _cloudRevision: 1 };
const cloudMatch = { id: 'c', title: 'Cloud version', status: 'todo', updatedAt: '2024-01-02T00:00:00Z', _cloudDirty: false, _cloudRevision: 1 };
const merge2 = mergeTaskWorkspace([dirty], [cloudMatch]);
assert.equal(merge2.merged.get('c').title, 'Dirty local', 'Dirty local must win at same revision');
assert.equal(merge2.upload.find((r) => r.id === 'c')?.id, 'c', 'Dirty local must be queued for upload');

// Merge: conflict detected when revisions diverge
const stale = { id: 'd', title: 'Stale local', status: 'todo', updatedAt: '2024-01-01T00:00:00Z', _cloudDirty: true, _cloudRevision: 1 };
const ahead = { id: 'd', title: 'Ahead cloud', status: 'done', updatedAt: '2024-01-02T00:00:00Z', _cloudDirty: false, _cloudRevision: 2 };
const merge3 = mergeTaskWorkspace([stale], [ahead]);
assert.ok(merge3.conflicts.includes('d'), 'Revision divergence must be flagged as a conflict');

// Status history: addTaskEvent stores correctly
const histTask = saveTask({ title: 'History test', status: 'todo', scope: 'company' });
const evt = addTaskEvent({ taskId: histTask.id, userId: 'user-1', displayName: 'Alice', fromStatus: 'todo', toStatus: 'in-progress' });
assert.ok(evt.id, 'Event must have an ID');
assert.equal(evt.taskId, histTask.id);
assert.equal(evt.fromStatus, 'todo');
assert.equal(evt.toStatus, 'in-progress');
assert.equal(evt.displayName, 'Alice');
assert.equal(evt._cloudDirty, true, 'New event must be marked cloud dirty');

// Status history: getTaskEvents filters by task
addTaskEvent({ taskId: 'other-task', userId: null, displayName: '', fromStatus: 'todo', toStatus: 'done' });
const taskEvts = getTaskEvents(histTask.id);
assert.equal(taskEvts.length, 1, 'getTaskEvents must return only events for that task');
assert.equal(taskEvts[0].id, evt.id);

// Status history: getAllTaskEvents is sorted ascending by createdAt
const all = getAllTaskEvents();
for (let i = 1; i < all.length; i++) {
  assert.ok(all[i].createdAt >= all[i - 1].createdAt, 'Events must be sorted by createdAt ascending');
}

// Discussion: comments are task-specific, trimmed, ordered, and queued for cloud sync
const comment1 = addTaskComment({ taskId: histTask.id, userId: 'user-1', displayName: 'Alice', message: '  Please check the quote.  ' });
assert.equal(comment1.message, 'Please check the quote.');
assert.equal(comment1._cloudDirty, true);
addTaskComment({ taskId: 'other-task', userId: 'user-2', displayName: 'Bob', message: 'Different task' });
assert.equal(getTaskComments(histTask.id).length, 1);
assert.equal(getTaskComments(histTask.id)[0].displayName, 'Alice');
assert.equal(getAllTaskComments().length, 2);
assert.throws(() => addTaskComment({ taskId: histTask.id, message: '   ' }), /Enter a comment/);

// Reminder schedule: todayInLondon returns a valid ISO date
const todayStr = todayInLondon();
assert.match(todayStr, /^\d{4}-\d{2}-\d{2}$/, 'todayInLondon must return YYYY-MM-DD');

// Reminder schedule: addDays shifts correctly
assert.equal(addDays('2025-01-01', 7), '2025-01-08');
assert.equal(addDays('2025-01-01', -1), '2024-12-31');

// Reminder schedule: findDueTasks finds due and overdue tasks
const now = new Date('2025-06-10T08:00:00Z');
const dueToday = { id: 't1', title: 'Pay invoice', due_date: '2025-06-10', status: 'todo', assigned_to: null, deleted_at: null };
const overdue = { id: 't2', title: 'File returns', due_date: '2025-06-07', status: 'in-progress', assigned_to: 'u1', deleted_at: null };
const notYetDue = { id: 't3', title: 'Renew insurance', due_date: '2025-06-15', status: 'todo', assigned_to: null, deleted_at: null };
const alreadyDone = { id: 't4', title: 'Done thing', due_date: '2025-06-10', status: 'done', assigned_to: null, deleted_at: null };
const tooOld = { id: 't5', title: 'Ancient task', due_date: '2025-05-01', status: 'todo', assigned_to: null, deleted_at: null };
const deleted = { id: 't6', title: 'Deleted', due_date: '2025-06-10', status: 'todo', assigned_to: null, deleted_at: '2025-06-09T00:00:00Z' };

const dueResults = findDueTasks([dueToday, overdue, notYetDue, alreadyDone, tooOld, deleted], now);
assert.equal(dueResults.length, 2, 'findDueTasks must return only tasks due today or overdue within 7 days');
assert.ok(dueResults.find((r) => r.taskId === 't1' && r.reminderType === 'due_today'), 'Due today task must have due_today type');
assert.ok(dueResults.find((r) => r.taskId === 't2' && r.reminderType === 'overdue'), 'Overdue task must have overdue type');
assert.equal(dueResults.find((r) => r.taskId === 't2')?.assignedTo, 'u1', 'assignedTo must be forwarded');

// Storage: assignedTo is persisted and defaults to null
const assignedTask = saveTask({ title: 'Assigned task', status: 'todo', scope: 'company', assignedTo: 'user-abc' });
assert.equal(assignedTask.assignedTo, 'user-abc', 'saveTask must persist assignedTo');
const unassignedTask = saveTask({ title: 'Unassigned task', status: 'todo', scope: 'company' });
assert.equal(unassignedTask.assignedTo, null, 'saveTask must default assignedTo to null');

// Storage: updating a task preserves assignedTo when not changed
const savedWithAssignee = saveTask({ title: 'Check assignee', status: 'todo', scope: 'company', assignedTo: 'user-xyz' });
const updated2 = saveTask({ id: savedWithAssignee.id, title: 'Check assignee updated', status: 'in-progress', scope: 'company' });
assert.equal(updated2.assignedTo, 'user-xyz', 'Updating a task without passing assignedTo must preserve existing value');

// HTML checks
assert.match(taskHtml, /id="taskSyncStatus" class="sync-status"/, 'Task page must include sync status');
assert.match(taskHtml, /id="taskList"/, 'Task page must include task list container');
assert.match(taskHtml, /id="taskEmpty"/, 'Task page must include empty state');
assert.match(taskHtml, /id="taskDialog"/, 'Task page must include task dialog');
assert.match(taskHtml, /id="taskHistory"/, 'Task dialog must include history section');
assert.match(taskHtml, /id="taskHistoryList"/, 'Task dialog must include history list');
assert.match(taskHtml, /id="taskDiscussion"/, 'Task dialog must include a discussion area');
assert.match(taskHtml, /id="taskCommentList"/, 'Task discussion must include a comment list');
assert.match(taskHtml, /id="addTaskCommentBtn"/, 'Task discussion must include a post action');
assert.match(taskHtml, /id="taskAssignedTo"/, 'Task dialog must include assignee select');
assert.match(taskHtml, /id="taskAssignedFilter"/, 'Task filter panel must include assignee filter select');
assert.match(taskHtml, /id="suggestionDialog"/, 'Task page must include the suggestion dialog');
assert.match(taskHtml, /data-suggestion="Make offer"/, 'Suggestion dialog must include Make offer option');
assert.match(taskHtml, /data-suggestion="Arrange second viewing"/, 'Suggestion dialog must include Arrange second viewing option');
assert.match(taskHtml, /data-suggestion="Request lease pack"/, 'Suggestion dialog must include Request lease pack option');
assert.match(taskHtml, /data-active-page="tasks"/, 'Task page must set active nav page');
assert.match(taskHtml, /supabase-config\.js[\s\S]*cloud\.js[\s\S]*tasks\.js/, 'Task page must load cloud dependencies before its module');

// JS checks
assert.match(taskPage, /import \{ renderSyncStatus \} from '\.\.\/\.\.\/components\/sync-status\.js'/, 'Tasks must use shared sync-status component');
assert.match(taskPage, /syncTaskWorkspace\(cloud\)/, 'Tasks must use the shared task sync service');
assert.match(taskPage, /syncTaskEvents\(cloud\)/, 'Tasks must sync status history events');
assert.match(taskPage, /syncTaskComments\(cloud\)/, 'Tasks must sync discussion comments');
assert.match(taskPage, /STATUS_GROUP_ORDER = \['in-progress', 'todo', 'done'\]/, 'In-progress groups must render first');
assert.match(taskPage, /addTaskEvent\(/, 'Tasks must record status change events');
assert.match(taskPage, /canEdit/, 'Tasks must gate writes behind edit permission');
assert.match(taskPage, /getWorkspaceAccess/, 'Tasks must check workspace access for edit permission');
assert.match(taskPage, /nextStatus\(/, 'Task cards must support quick status cycling');
assert.match(taskPage, /loadWorkspaceMembers/, 'Tasks must load workspace members for the assignee picker');
assert.match(taskPage, /populateAssigneeOptions/, 'Tasks must populate assignee selects from member list');
assert.match(taskPage, /taskAssignedFilter/, 'Tasks must support filtering by assignee');
assert.match(taskPage, /VIEWING_RE/, 'Tasks must define the viewing keyword pattern for suggestions');
assert.match(taskPage, /checkViewingSuggestion/, 'Tasks must check for viewing suggestions on status change');
assert.match(taskPage, /applySuggestion/, 'Tasks must apply selected suggestions by opening a pre-filled form');

// Cloud checks
assert.match(cloud, /async function listTasks\(\)/, 'Cloud task listing is missing');
assert.match(cloud, /async function upsertTask\(record\)/, 'Cloud task upsert is missing');
assert.match(cloud, /upsert_task_if_current/, 'Task writes must use the revision-safe RPC');
assert.match(cloud, /p_assigned_to/, 'upsertTask must pass the assignedTo field to the RPC');
assert.match(cloud, /isTaskConflict/, 'Task conflict detection is missing');
assert.match(cloud, /async function listTaskEvents\(\)/, 'Cloud task event listing is missing');
assert.match(cloud, /async function insertTaskEvent\(/, 'Cloud task event insert is missing');
assert.match(cloud, /insert_task_event/, 'Task events must use the insert_task_event RPC');
assert.match(cloud, /async function listTaskComments\(\)/, 'Cloud task comment listing is missing');
assert.match(cloud, /async function insertTaskComment\(comment\)/, 'Cloud task comment insertion is missing');
assert.match(cloud, /insert_task_comment/, 'Task comments must use the protected insert RPC');
assert.match(cloud, /async function listActiveMembers\(\)/, 'Cloud must expose listActiveMembers for the assignee picker');
assert.match(cloud, /list_active_members/, 'listActiveMembers must call the list_active_members RPC');

// Workspace sync includes tasks and events
assert.match(workspaceSync, /syncTasks: syncTaskWorkspace/, 'Workspace sync must include the task sync service');
assert.match(workspaceSync, /syncTaskEvents/, 'Workspace sync must include task event sync');
assert.match(workspaceSync, /syncTaskComments/, 'Workspace sync must include task comment sync');

console.log('Task checks passed.');
