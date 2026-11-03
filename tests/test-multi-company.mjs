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
assert.match(cloud, /async function listCompanyProfiles\(/);
assert.match(cloud, /upsert_company_profile_by_id_if_current/);
console.log('Multiple company isolation, legacy preservation and sync tests passed.');
