const EVENTS_KEY = 'spv-property-calculator.task-events.v1';

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `event-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readRaw() {
  try {
    const parsed = JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(events) {
  try {
    localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
    return true;
  } catch (error) {
    console.error('Could not save task events:', error);
    return false;
  }
}

export function getAllTaskEvents() {
  return readRaw().sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export function getTaskEvents(taskId) {
  return getAllTaskEvents().filter((e) => e.taskId === taskId);
}

export function addTaskEvent({ taskId, userId, displayName, fromStatus, toStatus }) {
  const events = readRaw();
  const event = {
    id: makeId(),
    taskId: String(taskId),
    userId: userId || null,
    displayName: String(displayName || ''),
    fromStatus: fromStatus || null,
    toStatus: toStatus || null,
    createdAt: new Date().toISOString(),
    _cloudDirty: true
  };
  events.push(event);
  writeRaw(events);
  return event;
}

export function replaceTaskEvents(events) {
  writeRaw(Array.isArray(events) ? events : []);
  return true;
}
