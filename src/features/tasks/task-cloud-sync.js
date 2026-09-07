import { getAllTasks, replaceTasks } from './task-storage.js';

let activeTaskSync = null;

function asTime(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mergeTaskWorkspace(localItems, cloudItems) {
  const localMap = new Map((localItems || []).map((item) => [String(item.id), item]));
  const cloudMap = new Map((cloudItems || []).map((item) => [String(item.id), item]));
  const merged = new Map();
  const upload = [];
  const conflicts = [];

  for (const id of new Set([...localMap.keys(), ...cloudMap.keys()])) {
    const local = localMap.get(id);
    const cloud = cloudMap.get(id);
    if (local && !cloud) {
      merged.set(id, local);
      upload.push(local);
      continue;
    }
    if (!local && cloud) {
      merged.set(id, cloud);
      continue;
    }
    if (!local || !cloud) continue;

    const localRevision = Math.max(0, Number(local._cloudRevision) || 0);
    const cloudRevision = Math.max(0, Number(cloud._cloudRevision) || 0);
    if (local._cloudDirty) {
      merged.set(id, local);
      if (localRevision === cloudRevision) upload.push(local);
      else conflicts.push(id);
    } else if (cloudRevision > localRevision || asTime(cloud.updatedAt) > asTime(local.updatedAt)) {
      merged.set(id, cloud);
    } else if (asTime(local.updatedAt) > asTime(cloud.updatedAt)) {
      merged.set(id, local);
      upload.push(local);
    } else {
      merged.set(id, cloud);
    }
  }

  return { localMap, merged, upload, conflicts };
}

async function performTaskSync(cloud) {
  if (!cloud?.listTasks || !cloud?.upsertTask) {
    return { changes: 0, conflicts: [] };
  }

  let cloudItems;
  try {
    cloudItems = await cloud.listTasks();
  } catch (error) {
    error.syncStage = 'downloading tasks';
    throw error;
  }

  const merge = mergeTaskWorkspace(getAllTasks(), cloudItems);
  let uploaded = 0;
  for (const item of merge.upload) {
    try {
      const synced = await cloud.upsertTask(item);
      merge.merged.set(String(item.id), synced);
      uploaded += 1;
    } catch (error) {
      if (cloud.isTaskConflict?.(error)) {
        merge.conflicts.push(String(item.id));
        continue;
      }
      error.syncStage = error.syncStage || 'uploading tasks';
      throw error;
    }
  }

  try {
    replaceTasks([...merge.merged.values()]);
  } catch (error) {
    error.syncStage = 'saving synced tasks on this device';
    throw error;
  }

  const downloaded = [...merge.merged.values()].filter((item) => {
    const local = merge.localMap.get(String(item.id));
    return !local || Number(item._cloudRevision || 0) > Number(local._cloudRevision || 0);
  }).length;

  return { changes: uploaded + downloaded, conflicts: merge.conflicts };
}

export function syncTaskWorkspace(cloud) {
  if (activeTaskSync) return activeTaskSync;
  activeTaskSync = performTaskSync(cloud).finally(() => {
    activeTaskSync = null;
  });
  return activeTaskSync;
}
