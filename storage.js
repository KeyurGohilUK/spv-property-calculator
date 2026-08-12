const STORAGE_KEY = 'spv-property-calculator.properties.v1';
// Legacy queue from the previous hard-delete edition. It is retained only so an
// offline delete made before this upgrade can be converted into a soft archive.
const DELETED_KEY = 'spv-property-calculator.deleted.v1';

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `spv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Could not read saved properties:', error);
    return [];
  }
}

function writeRaw(properties) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(properties));
    return true;
  } catch (error) {
    console.error('Could not save properties:', error);
    return false;
  }
}

function readDeletedRaw() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DELETED_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function writeDeletedRaw(items) { try { localStorage.setItem(DELETED_KEY, JSON.stringify(items)); return true; } catch { return false; } }

export function getProperties() { return readRaw().sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0)); }
export function getActiveProperties() { return getProperties().filter((item)=>!item.deletedAt); }
export function getArchivedProperties() { return getProperties().filter((item)=>Boolean(item.deletedAt)).sort((a,b)=>new Date(b.deletedAt||b.updatedAt||0)-new Date(a.deletedAt||a.updatedAt||0)); }
export function replaceProperties(properties) { return writeRaw(Array.isArray(properties) ? properties : []); }
export function getProperty(id) { return readRaw().find((item)=>item.id===id) || null; }
export function getPendingDeletes() { return readDeletedRaw(); }
export function clearPendingDeletes(ids) { const set=new Set((ids||[]).map(String)); return writeDeletedRaw(readDeletedRaw().filter((item)=>!set.has(String(item.id)))); }

export function saveProperty(property) {
  const properties=readRaw(); const now=new Date().toISOString();
  const record={...property,id:property.id||makeId(),createdAt:property.createdAt||now,updatedAt:now};
  const index=properties.findIndex((item)=>item.id===record.id); if(index>=0) properties[index]=record; else properties.push(record);
  if(!writeRaw(properties)) throw new Error('Unable to save. Your browser may have storage disabled or full.');
  clearPendingDeletes([record.id]); return record;
}
export function archiveProperty(id) { const source=getProperty(id); if(!source) return null; return saveProperty({...source,deletedAt:new Date().toISOString()}); }
export function restoreProperty(id) { const source=getProperty(id); if(!source) return null; return saveProperty({...source,deletedAt:null}); }
export function deleteProperty(id) { return Boolean(archiveProperty(id)); }
export function duplicateProperty(id) {
  const source=getProperty(id); if(!source || source.deletedAt) return null; const now=new Date().toISOString();
  const copy={...source,id:makeId(),title:`${source.title||'Untitled Property'} (Copy)`,deletedAt:null,createdAt:now,updatedAt:now};
  const properties=readRaw(); properties.push(copy); if(!writeRaw(properties)) return null; return copy;
}
