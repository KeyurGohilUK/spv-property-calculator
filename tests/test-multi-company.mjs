import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cache = new Map();
const session = new Map();
globalThis.localStorage = {
  getItem: (id) => cache.get(id) ?? null,
  setItem: (id, value) => cache.set(id, String(value))
};
globalThis.sessionStorage = {
  getItem: (id) => session.get(id) ?? null,
  setItem: (id, value) => session.set(id, String(value))
};

const {
  newCompanyId, setActiveCompanyId, getCompanyProfile, saveCompanyProfile,
  deleteCompanyProfile, listAllStoredCompanyProfiles,
  getStoredCompanyProfile, listStoredCompanyProfiles, saveAppointment, saveInvestment,
  saveComplianceConfirmation, replaceCompanyProfile
} = await import('../src/features/company/company-storage.js');
const { performCompanyProfilesSync } = await import('../src/features/company/company-cloud-sync.js');

const first = saveCompanyProfile({ companyName: 'Existing SPV', companyNumber: '17531012' });
assert.equal(first.id, 'default', 'Existing company must retain the original default identity');
const director = saveAppointment({ name: 'Original Director', roles: ['director'] }).appointments[0];
saveInvestment({ memberId: director.id, amount: 4500 });
saveComplianceConfirmation('director-identity:once', true, '2026-11-03');

const id = newCompanyId();
assert.match(id, /^company-[A-Za-z0-9_-]{8,80}$/);
setActiveCompanyId(id);
const second = saveCompanyProfile({ companyName: 'Second SPV', companyNumber: '01234567' });
assert.equal(second.id, id);
assert.deepEqual(second.appointments, [], 'New company must not inherit existing appointments');
assert.deepEqual(second.investments, [], 'New company must not inherit existing contributions');
assert.deepEqual(second.complianceConfirmations, {}, 'New company must not inherit compliance records');
saveAppointment({ name: 'Second Director', roles: ['director'] });
assert.equal(getCompanyProfile().appointments.length, 1);
assert.equal(getStoredCompanyProfile('default').appointments[0].name, 'Original Director');
assert.equal(getStoredCompanyProfile('default').investments[0].amount, 4500);
assert.equal(getStoredCompanyProfile('default').complianceConfirmations['director-identity:once'].status, 'confirmed');
assert.equal(listStoredCompanyProfiles().length, 2);

const uploaded = [];
const result = await performCompanyProfilesSync({
  listCompanyProfiles: async () => [],
  upsertCompanyProfile: async (item) => {
    uploaded.push(item.id);
    return { ...item, _cloudDirty: false, _cloudRevision: 1 };
  }
});
assert.deepEqual(new Set(uploaded), new Set(['default', id]));
assert.equal(result.changes, 2);
assert.equal(getStoredCompanyProfile('default')._cloudDirty, false);
assert.equal(getStoredCompanyProfile(id)._cloudDirty, false);

replaceCompanyProfile({ ...getStoredCompanyProfile(id), companyName: 'Second SPV Updated', _cloudRevision: 2 });
assert.equal(getStoredCompanyProfile(id).companyName, 'Second SPV Updated');
assert.equal(getStoredCompanyProfile('default').companyName, 'Existing SPV');
assert.throws(() => setActiveCompanyId('../wrong'), /Invalid company selection/);

// Soft deletion must hide the company but sync its tombstone, not resurrect it.
setActiveCompanyId(id);
const deleted = deleteCompanyProfile(id);
assert.ok(deleted.deletedAt);
assert.equal(deleted._cloudDirty, true);
assert.equal(listStoredCompanyProfiles().some((item) => item.id === id), false);
assert.equal(listAllStoredCompanyProfiles().some((item) => item.id === id), true);
assert.throws(() => saveCompanyProfile({ companyName: 'Resurrected SPV' }), /deleted/);
const syncedDeletion = await performCompanyProfilesSync({
  listCompanyProfiles: async () => [
    { ...getStoredCompanyProfile('default'), _cloudRevision: 1, _cloudDirty: false },
    { ...deleted, deletedAt: null, _cloudDirty: false, _cloudRevision: 2 }
  ],
  upsertCompanyProfile: async (item) => ({
    ...item, _cloudDirty: false, _cloudRevision: 3
  })
});
assert.equal(syncedDeletion.conflicts.length, 0);
assert.equal(getStoredCompanyProfile(id)._cloudDirty, false);
assert.ok(getStoredCompanyProfile(id).deletedAt);
const anotherDevice = [];
await performCompanyProfilesSync({
  listCompanyProfiles: async () => [{ ...getStoredCompanyProfile(id) }],
  upsertCompanyProfile: async () => { throw new Error('Deleted record must not be re-uploaded'); }
}, { listLocal: () => [], replaceLocal: (item) => anotherDevice.push(item) });
assert.ok(anotherDevice[0].deletedAt, 'A new device must download the deletion marker');

const index = readFileSync(new URL('../company/index.html', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../company/details.html', import.meta.url), 'utf8');
const cloud = readFileSync(new URL('../cloud.js', import.meta.url), 'utf8');
assert.match(index, /id="companyCards"/);
assert.match(index, /src="\.\/src\/features\/company\/company-list\.js"/);
assert.doesNotMatch(index, /id="companyComplianceItems"/, 'Company chooser must not render a details dashboard');
assert.match(detail, /id="companyComplianceItems"/);
assert.match(detail, /id="companyAppointmentsRows"/);
assert.match(detail, /id="companyInvestmentSummaryRows"/);
assert.match(detail, /All companies/);
assert.match(detail, /id="deleteCompanyDialog"/);
assert.match(detail, /id="confirmDeleteCompanyInput"/);
assert.match(cloud, /async function listCompanyProfiles\(/);
assert.match(cloud, /upsert_company_profile_by_id_if_current/);
assert.match(cloud, /deletedAt: record\\?\\.deletedAt/);

const listJs = readFileSync(new URL('../src/features/company/company-list.js', import.meta.url), 'utf8');
const detailsJs = readFileSync(new URL('../src/features/company/company.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles/features/company.css', import.meta.url), 'utf8');
assert.match(listJs, /searchCompanyStatus\('This registered company already has a card\. Open the existing company instead\.', 'error'\)/);
assert.match(listJs, /status\.setAttribute\('role', kind === 'error' \? 'alert' : 'status'\)/);
assert.match(detailsJs, /companyDetailsError\('This company number is already recorded in another company card\.'\)/);
assert.match(styles, /\.company-official-search \.is-error/);
assert.match(styles, /border-inline-start-width: 4px/);
assert.match(styles, /var\(--danger\)/);

console.log('Multiple company isolation, legacy preservation and sync tests passed.');
