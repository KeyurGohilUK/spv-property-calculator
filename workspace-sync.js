import {
  getProperties,
  replaceProperties,
  getPendingDeletes,
  clearPendingDeletes
} from './storage.js';
import { syncExpenseWorkspace } from './expense-cloud-sync.js';

let activeSync = null;

function syncError(error, stage) {
  if (error && !error.syncStage) error.syncStage = stage;
  return error;
}

export function formatWorkspaceSyncError(error) {
  const stage = error?.syncStage ? ` (while ${error.syncStage})` : '';
  const detail = String(error?.message || 'The cloud workspace could not be reached.').trim().replace(/[.\s]+$/, '');
  return `Sync pending: ${detail}${stage}. Local changes remain safe. Try again.`;
}

async function performWorkspaceSync(cloud, adapters) {
  if (!cloud?.syncAll) throw new Error('Cloud workspace sync is unavailable.');

  let propertyResult;
  try {
    propertyResult = await cloud.syncAll(adapters.getProperties(), adapters.getPendingDeletes());
  } catch (error) {
    throw syncError(error, 'syncing properties');
  }

  if (!adapters.replaceProperties(propertyResult.merged)) {
    throw syncError(new Error('Could not update the property cache on this device.'), 'saving synced properties');
  }
  if (!adapters.clearPendingDeletes(propertyResult.clearedDeleteIds || [])) {
    throw syncError(new Error('Could not update the property deletion queue on this device.'), 'saving synced properties');
  }

  const expenseResult = await adapters.syncExpenses(cloud);
  const conflictCount = (propertyResult.conflicts?.length || 0) + (expenseResult.conflicts?.length || 0);
  const changes = Number(propertyResult.uploadedCount || 0)
    + Number(propertyResult.downloadedCount || 0)
    + (propertyResult.archivedLegacyIds?.length || 0)
    + (propertyResult.permanentlyDeletedIds?.length || 0)
    + Number(expenseResult.changes || 0);

  const message = conflictCount
    ? `${conflictCount} sync conflict${conflictCount === 1 ? '' : 's'} detected. Local changes are safe and were not overwritten.`
    : changes
      ? `Synced ${changes} change${changes === 1 ? '' : 's'} with the shared workspace.`
      : 'Cloud is up to date.';

  return { propertyResult, expenseResult, conflictCount, changes, message };
}

export function syncWorkspace(cloud, overrides = {}) {
  if (activeSync) return activeSync;
  const adapters = {
    getProperties,
    replaceProperties,
    getPendingDeletes,
    clearPendingDeletes,
    syncExpenses: syncExpenseWorkspace,
    ...overrides
  };
  activeSync = performWorkspaceSync(cloud, adapters).finally(() => {
    activeSync = null;
  });
  return activeSync;
}
