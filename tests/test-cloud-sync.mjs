import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../cloud.js', import.meta.url), 'utf8');
const window = {
  SPV_SUPABASE_CONFIG: {
    url: 'https://YOUR_PROJECT_REF.supabase.co',
    publishableKey: 'sb_publishable_REPLACE_ME'
  }
};
vm.runInContext(source, vm.createContext({ window, document: {}, console, setTimeout, clearTimeout }));

const merge = window.SPVCloud.mergePropertySets;

const local = [
  { id: 'a', title: 'Local newer', updatedAt: '2026-08-12T10:00:00Z', deletedAt: null },
  { id: 'b', title: 'Local archived', updatedAt: '2026-08-12T11:00:00Z', deletedAt: '2026-08-12T11:00:00Z' }
];
const cloud = [
  { id: 'a', title: 'Cloud older', updatedAt: '2026-08-12T08:00:00Z', deletedAt: null },
  { id: 'c', title: 'Cloud archived', updatedAt: '2026-08-12T12:00:00Z', deletedAt: '2026-08-12T12:00:00Z' }
];
const result = merge(local, cloud);
const byId = new Map(result.merged.map((item) => [item.id, item]));

if (byId.get('a')?.title !== 'Local newer') throw new Error('newer local should win');
if (!byId.get('b')?.deletedAt || !byId.get('c')?.deletedAt) throw new Error('archived rows must remain in merge');
if (!result.upload.some((item) => item.id === 'a') || !result.upload.some((item) => item.id === 'b')) {
  throw new Error('expected uploads missing');
}

// A local edit based on the current cloud revision is safe to upload.
const safeEdit = merge(
  [{ id: 'safe', title: 'Local edit', updatedAt: '2026-08-12T13:00:00Z', _cloudRevision: 2, _cloudDirty: true }],
  [{ id: 'safe', title: 'Cloud base', updatedAt: '2026-08-12T12:00:00Z', _cloudRevision: 2, _cloudDirty: false }]
);
if (safeEdit.upload.length !== 1 || safeEdit.conflicts.length !== 0) {
  throw new Error('current-revision local edit should upload');
}

// A stale local edit must be retained locally and reported, never overwritten.
const staleEdit = merge(
  [{ id: 'conflict', title: 'Unsynced local work', updatedAt: '2026-08-12T14:00:00Z', _cloudRevision: 2, _cloudDirty: true }],
  [{ id: 'conflict', title: 'Newer cloud edit', updatedAt: '2026-08-12T15:00:00Z', _cloudRevision: 3, _cloudDirty: false }]
);
if (staleEdit.conflicts.length !== 1) throw new Error('stale revision conflict was not detected');
if (staleEdit.upload.length !== 0) throw new Error('stale revision must not upload');
if (staleEdit.merged[0]?.title !== 'Unsynced local work') throw new Error('unsynced local work must be preserved');

if (!source.includes("rpc('upsert_property_if_current'")) throw new Error('revision-checked property RPC missing');
if (!source.includes('p_expected_revision')) throw new Error('expected revision is not sent');
if (!source.includes('_cloudDirty: false')) throw new Error('downloaded records must be marked clean');
if (!source.includes('PROPERTY_CONFLICT')) throw new Error('conflict error handling missing');
if (!source.includes('archivedLegacyIds')) throw new Error('legacy conversion missing');
if (!source.includes("rpc('permanently_delete_property'")) throw new Error('permanent-delete RPC missing');
if (!source.includes("from('property_deletions')")) throw new Error('permanent deletion tombstones missing');
if (!source.includes('permanentlyDeletedIds')) throw new Error('permanent deletion sync filtering missing');
if (!source.includes("from('push_subscriptions')")) throw new Error('push subscription persistence missing');
if (!source.includes('onBeforeSignOut')) throw new Error('push cleanup lifecycle missing');

console.log('Conflict-safe archive and cloud merge tests passed.');
