import {
  getStoredCompanyProfile,
  replaceCompanyProfile
} from './company-storage.js';

let activeCompanySync = null;

function asTime(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function performCompanyProfileSync(cloud, adapters = {}) {
  if (!cloud?.getCompanyProfile || !cloud?.upsertCompanyProfile) return { changes: 0, conflicts: [] };
  const getLocal = adapters.getLocal || getStoredCompanyProfile;
  const replaceLocal = adapters.replaceLocal || replaceCompanyProfile;
  let cloudProfile;
  try {
    cloudProfile = await cloud.getCompanyProfile();
  } catch (error) {
    error.syncStage = 'downloading company details';
    throw error;
  }

  const localProfile = getLocal();
  if (!localProfile && !cloudProfile) return { changes: 0, conflicts: [] };
  if (!localProfile && cloudProfile) {
    try {
      replaceLocal(cloudProfile);
      return { changes: 1, conflicts: [] };
    } catch (error) {
      error.syncStage = 'saving company details on this device';
      throw error;
    }
  }
  if (localProfile && !cloudProfile) {
    if (!localProfile._cloudDirty) return { changes: 0, conflicts: [] };
    try {
      const saved = await cloud.upsertCompanyProfile(localProfile);
      replaceLocal(saved);
      return { changes: 1, conflicts: [] };
    } catch (error) {
      if (cloud.isCompanyProfileConflict?.(error)) return { changes: 0, conflicts: ['default'] };
      error.syncStage = 'uploading company details';
      throw error;
    }
  }

  const localRevision = Math.max(0, Number(localProfile._cloudRevision) || 0);
  const cloudRevision = Math.max(0, Number(cloudProfile._cloudRevision) || 0);
  if (localProfile._cloudDirty && localRevision !== cloudRevision) {
    return { changes: 0, conflicts: ['default'] };
  }
  if (!localProfile._cloudDirty && (cloudRevision > localRevision || asTime(cloudProfile.updatedAt) > asTime(localProfile.updatedAt))) {
    try {
      replaceLocal(cloudProfile);
      return { changes: 1, conflicts: [] };
    } catch (error) {
      error.syncStage = 'saving company details on this device';
      throw error;
    }
  }
  if (!localProfile._cloudDirty && asTime(localProfile.updatedAt) <= asTime(cloudProfile.updatedAt)) {
    replaceLocal(cloudProfile);
    return { changes: 0, conflicts: [] };
  }

  try {
    const saved = await cloud.upsertCompanyProfile(localProfile);
    replaceLocal(saved);
    return { changes: 1, conflicts: [] };
  } catch (error) {
    if (cloud.isCompanyProfileConflict?.(error)) return { changes: 0, conflicts: ['default'] };
    error.syncStage = 'uploading company details';
    throw error;
  }
}

export function syncCompanyProfile(cloud, adapters = {}) {
  if (activeCompanySync) return activeCompanySync;
  activeCompanySync = performCompanyProfileSync(cloud, adapters).finally(() => {
    activeCompanySync = null;
  });
  return activeCompanySync;
}
