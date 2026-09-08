const COMMENTS_KEY = 'spv-property-calculator.task-comments.v1';

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `comment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readRaw() {
  try {
    const parsed = JSON.parse(localStorage.getItem(COMMENTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(comments) {
  try {
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(comments));
    return true;
  } catch (error) {
    console.error('Could not save task comments:', error);
    return false;
  }
}

export function getAllTaskComments() {
  return readRaw().sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export function getTaskComments(taskId) {
  return getAllTaskComments().filter((comment) => comment.taskId === taskId);
}

export function addTaskComment({ taskId, userId, displayName, message }) {
  const cleanMessage = String(message || '').trim();
  if (!cleanMessage) throw new Error('Enter a comment.');
  const comments = readRaw();
  const now = new Date().toISOString();
  const comment = {
    id: makeId(),
    taskId: String(taskId),
    userId: userId || null,
    displayName: String(displayName || ''),
    message: cleanMessage,
    createdAt: now,
    updatedAt: now,
    _cloudDirty: true
  };
  comments.push(comment);
  if (!writeRaw(comments)) throw new Error('Unable to save this comment on this device.');
  return comment;
}

export function updateTaskComment(commentId, message, userId) {
  const cleanMessage = String(message || '').trim();
  if (!cleanMessage) throw new Error('Enter a comment.');
  const comments = readRaw();
  const index = comments.findIndex((comment) => comment.id === commentId);
  if (index < 0) throw new Error('Comment could not be found.');
  const existing = comments[index];
  if (!userId || existing.userId !== userId) throw new Error('You can only edit your own comments.');
  const updated = {
    ...existing,
    message: cleanMessage,
    updatedAt: new Date().toISOString(),
    _cloudDirty: true
  };
  comments[index] = updated;
  if (!writeRaw(comments)) throw new Error('Unable to update this comment on this device.');
  return updated;
}

export function replaceTaskComments(comments) {
  if (!writeRaw(Array.isArray(comments) ? comments : [])) {
    throw new Error('Unable to update task comments on this device.');
  }
  return true;
}
