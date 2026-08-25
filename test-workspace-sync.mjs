import assert from 'node:assert/strict';
import { syncWorkspace, formatWorkspaceSyncError } from './workspace-sync.js';

function adapters(overrides = {}) {
  return {
    getProperties: () => [{ id: 'local-property' }],
    getPendingDeletes: () => [{ id: 'deleted-property' }],
    replaceProperties: () => true,
    clearPendingDeletes: () => true,
    syncExpenses: async () => ({ changes: 2, conflicts: [] }),
    ...overrides
  };
}

const cloud = {
  async syncAll(properties, pendingDeletes) {
    assert.equal(properties[0].id, 'local-property');
    assert.equal(pendingDeletes[0].id, 'deleted-property');
    return {
      merged: [{ id: 'synced-property' }],
      clearedDeleteIds: ['deleted-property'],
      uploadedCount: 1,
      downloadedCount: 2,
      archivedLegacyIds: ['legacy-property'],
      permanentlyDeletedIds: [],
      conflicts: []
    };
  }
};

let savedProperties;
let clearedDeletes;
const result = await syncWorkspace(cloud, adapters({
  replaceProperties: (items) => { savedProperties = items; return true; },
  clearPendingDeletes: (ids) => { clearedDeletes = ids; return true; }
}));

assert.deepEqual(savedProperties, [{ id: 'synced-property' }]);
assert.deepEqual(clearedDeletes, ['deleted-property']);
assert.equal(result.changes, 6, 'property and expense changes must share one total');
assert.equal(result.conflictCount, 0);
assert.equal(result.message, 'Synced 6 changes with the shared workspace.');

const conflict = await syncWorkspace({
  syncAll: async () => ({
    merged: [], clearedDeleteIds: [], uploadedCount: 0, downloadedCount: 0,
    conflicts: ['property-conflict']
  })
}, adapters({ syncExpenses: async () => ({ changes: 0, conflicts: ['expense-conflict'] }) }));
assert.equal(conflict.conflictCount, 2);
assert.match(conflict.message, /2 sync conflicts detected/);

await assert.rejects(
  syncWorkspace({ syncAll: async () => ({ merged: [], clearedDeleteIds: [], conflicts: [] }) }, adapters({ replaceProperties: () => false })),
  (error) => error.syncStage === 'saving synced properties'
);

const stagedError = Object.assign(new Error('receipt upload failed.'), { syncStage: 'syncing a receipt' });
assert.equal(
  formatWorkspaceSyncError(stagedError),
  'Sync pending: receipt upload failed (while syncing a receipt). Local changes remain safe. Try again.'
);

let calls = 0;
let releaseSync;
const waitingCloud = {
  syncAll: () => {
    calls += 1;
    return new Promise((resolve) => { releaseSync = resolve; });
  }
};
const first = syncWorkspace(waitingCloud, adapters());
const second = syncWorkspace(waitingCloud, adapters());
assert.equal(first, second, 'concurrent callers must share one active workspace sync');
releaseSync({ merged: [], clearedDeleteIds: [], uploadedCount: 0, downloadedCount: 0, conflicts: [] });
await first;
assert.equal(calls, 1);

console.log('Shared workspace sync checks passed.');
