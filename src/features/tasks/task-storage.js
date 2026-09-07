const TASK_STORAGE_KEY = 'spv-property-calculator.tasks.v1';

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readRaw() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TASK_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Could not read tasks:', error);
    return [];
  }
}

function writeRaw(tasks) {
  try {
    localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
    return true;
  } catch (error) {
    console.error('Could not save tasks:', error);
    return false;
  }
}

const STATUS_ORDER = ['todo', 'in-progress', 'done'];

function sortTasks(items) {
  const statusRank = (s) => STATUS_ORDER.indexOf(s === 'done' ? 'done' : s) ?? 0;
  return [...items].sort((a, b) => {
    const statusOrder = statusRank(a.status) - statusRank(b.status);
    if (statusOrder !== 0) return statusOrder;
    const dueDiff = String(a.dueDate || 'z').localeCompare(String(b.dueDate || 'z'));
    if (dueDiff !== 0) return dueDiff;
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });
}

export function getAllTasks() { return sortTasks(readRaw()); }
export function getTasks() { return getAllTasks().filter((item) => !item.deletedAt); }

export function replaceTasks(tasks) {
  if (!writeRaw(Array.isArray(tasks) ? tasks : [])) {
    throw new Error('Unable to update local tasks.');
  }
  return true;
}

export function saveTask(task) {
  const tasks = readRaw();
  const now = new Date().toISOString();
  const scope = task.scope === 'property' ? 'property' : 'company';
  const existing = tasks.find((item) => item.id === task.id);
  const status = STATUS_ORDER.includes(task.status) ? task.status : 'todo';
  const record = {
    ...existing,
    ...task,
    id: task.id || makeId(),
    title: String(task.title || '').trim(),
    description: String(task.description || '').trim(),
    status,
    scope,
    propertyId: scope === 'property' ? String(task.propertyId || '') : '',
    dueDate: task.dueDate || null,
    assignedTo: task.assignedTo !== undefined ? (task.assignedTo || null) : (existing?.assignedTo ?? null),
    createdBy: task.createdBy || existing?.createdBy || null,
    deletedAt: null,
    createdAt: task.createdAt || existing?.createdAt || now,
    updatedAt: now,
    _cloudRevision: Math.max(0, Number(task._cloudRevision ?? existing?._cloudRevision) || 0),
    _cloudDirty: true
  };
  const index = tasks.findIndex((item) => item.id === record.id);
  if (index >= 0) tasks[index] = record;
  else tasks.push(record);
  if (!writeRaw(tasks)) throw new Error('Unable to save this task. Your browser storage may be full.');
  return record;
}

export function updateTaskStatus(id, status) {
  if (!STATUS_ORDER.includes(status)) throw new Error('Invalid task status.');
  const tasks = readRaw();
  const index = tasks.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const now = new Date().toISOString();
  tasks[index] = { ...tasks[index], status, updatedAt: now, _cloudDirty: true };
  writeRaw(tasks);
  return tasks[index];
}

export function deleteTask(id) {
  const tasks = readRaw();
  const index = tasks.findIndex((item) => item.id === id);
  if (index < 0) return false;
  const now = new Date().toISOString();
  tasks[index] = { ...tasks[index], deletedAt: now, updatedAt: now, _cloudDirty: true };
  return writeRaw(tasks);
}

export function nextStatus(current) {
  const index = STATUS_ORDER.indexOf(current);
  return STATUS_ORDER[(index + 1) % STATUS_ORDER.length];
}
