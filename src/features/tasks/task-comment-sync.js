import { getAllTaskComments, replaceTaskComments } from './task-comment-storage.js';

let activeSync = null;

async function performCommentSync(cloud) {
  if (!cloud?.listTaskComments || !cloud?.insertTaskComment) return { uploaded: 0 };

  const local = getAllTaskComments();
  let uploaded = 0;
  for (const comment of local.filter((item) => item._cloudDirty)) {
    try {
      await cloud.insertTaskComment(comment);
      uploaded += 1;
    } catch (error) {
      console.warn('Could not upload task comment:', error);
    }
  }

  let cloudComments;
  try {
    cloudComments = await cloud.listTaskComments();
  } catch (error) {
    error.syncStage = 'downloading task discussions';
    throw error;
  }

  const cloudIds = new Set(cloudComments.map((comment) => comment.id));
  const pendingLocal = local.filter((comment) => comment._cloudDirty && !cloudIds.has(comment.id));
  replaceTaskComments([...cloudComments, ...pendingLocal]);
  return { uploaded };
}

export function syncTaskComments(cloud) {
  if (activeSync) return activeSync;
  activeSync = performCommentSync(cloud).finally(() => { activeSync = null; });
  return activeSync;
}
