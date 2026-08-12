import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./cloud.js', import.meta.url), 'utf8');
const window = {
  SPV_SUPABASE_CONFIG: { url: 'https://YOUR_PROJECT_REF.supabase.co', publishableKey: 'sb_publishable_REPLACE_ME' }
};
const context = vm.createContext({ window, document: {}, console, setTimeout, clearTimeout });
vm.runInContext(source, context);

const merge = window.SPVCloud.mergePropertySets;
if (typeof merge !== 'function') throw new Error('mergePropertySets was not exposed');

const local = [
  { id: 'a', title: 'Local newer', updatedAt: '2026-08-12T10:00:00Z' },
  { id: 'b', title: 'Local only', updatedAt: '2026-08-12T09:00:00Z' },
  { id: 'd', title: 'Deleted locally', updatedAt: '2026-08-12T11:00:00Z' }
];
const cloud = [
  { id: 'a', title: 'Cloud older', updatedAt: '2026-08-12T08:00:00Z' },
  { id: 'c', title: 'Cloud only', updatedAt: '2026-08-12T12:00:00Z' },
  { id: 'd', title: 'Cloud deleted target', updatedAt: '2026-08-12T10:00:00Z' }
];
const result = merge(local, cloud, [{ id: 'd', deletedAt: '2026-08-12T12:30:00Z' }]);

const byId = new Map(result.merged.map((x) => [x.id, x]));
if (byId.get('a')?.title !== 'Local newer') throw new Error('Newer local record should win');
if (!byId.has('b')) throw new Error('Local-only record missing');
if (!byId.has('c')) throw new Error('Cloud-only record missing');
if (byId.has('d')) throw new Error('Pending delete should suppress record');
if (!result.upload.some((x) => x.id === 'a') || !result.upload.some((x) => x.id === 'b')) throw new Error('Expected local uploads missing');

console.log('Cloud merge tests passed.');
