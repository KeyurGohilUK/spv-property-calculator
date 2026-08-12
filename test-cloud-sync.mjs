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
  { id: 'c', title: 'Shared cloud only', updatedAt: '2026-08-12T12:00:00Z' },
  { id: 'd', title: 'Cloud deleted target', updatedAt: '2026-08-12T10:00:00Z' }
];
const result = merge(local, cloud, [{ id: 'd', deletedAt: '2026-08-12T12:30:00Z' }]);

const byId = new Map(result.merged.map((x) => [x.id, x]));
if (byId.get('a')?.title !== 'Local newer') throw new Error('Newer local record should win');
if (!byId.has('b')) throw new Error('Local-only record missing');
if (byId.get('c')?.title !== 'Shared cloud only') throw new Error('Shared cloud record should download');
if (byId.has('d')) throw new Error('Pending delete should suppress record in merge helper');
if (!result.upload.some((x) => x.id === 'a') || !result.upload.some((x) => x.id === 'b')) throw new Error('Expected local uploads missing');

if (!source.includes("onConflict: 'id'")) throw new Error('Shared cloud upsert must conflict on global property id');
if (source.includes("onConflict: 'user_id,id'")) throw new Error('Per-user upsert key still present');
if (!source.includes('asTime(deletedAt) >= asTime(cloud.updatedAt)')) throw new Error('Shared offline-delete conflict protection missing');

console.log('Shared cloud merge tests passed.');
