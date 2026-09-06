import { getAllTaskEvents, replaceTaskEvents } from './task-event-storage.js';

let activeSync = null;

async function performEventSync(cloud) {
  if (!cloud?.listTaskEvents || !cloud?.insertTaskEvent) {
    return { uploaded: 0 };
  }

  const local = getAllTaskEvents();
  const dirty = local.filter((e) => e._cloudDirty);
  let uploaded = 0;
  for (const event of dirty) {
    try {
      await cloud.insertTaskEvent(event);
      uploaded += 1;
    } catch (error) {
      console.warn('Could not upload task event:', error);
    }
  }

  let cloudEvents;
  try {
    cloudEvents = await cloud.listTaskEvents();
  } catch (error) {
    error.syncStage = 'downloading task history';
    throw error;
  }

  // Keep locally-created events that the cloud hasn't acknowledged yet
  const cloudIds = new Set(cloudEvents.map((e) => e.id));
  const pendingLocal = local.filter((e) => e._cloudDirty && !cloudIds.has(e.id));
  const merged = [...cloudEvents, ...pendingLocal].sort((a, b) =>
    (a.createdAt || '').localeCompare(b.createdAt || '')
  );

  replaceTaskEvents(merged);
  return { uploaded };
}

export function syncTaskEvents(cloud) {
  if (activeSync) return activeSync;
  activeSync = performEventSync(cloud).finally(() => {
    activeSync = null;
  });
  return activeSync;
}
