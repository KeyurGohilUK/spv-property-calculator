import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value))
};

const {
  getCompanyProfile,
  getStoredCompanyProfile,
  saveCompanyProfile,
  saveAppointment,
  deleteAppointment,
  saveInvestment,
  deleteInvestment,
  getInvestmentSummary,
  replaceCompanyProfile
} = await import('../src/features/company/company-storage.js');
const { performCompanyProfileSync } = await import('../src/features/company/company-cloud-sync.js');

assert.equal(getStoredCompanyProfile(), null, 'A new device must not invent a stored company profile');
assert.equal(getCompanyProfile().companyName, '', 'The page must have an empty profile fallback');

const created = saveCompanyProfile({
  companyName: '  Example SPV Limited  ',
  companyNumber: '01234567',
  registeredOffice: '1 Example Street, Bristol',
  companyStatus: 'Active',
  incorporationDate: '2020-04-17'
});
assert.equal(created.companyName, 'Example SPV Limited');
assert.equal(created._cloudDirty, true, 'Local edits must be queued for cloud sync');
assert.throws(() => saveCompanyProfile({ companyName: '' }), /company name/);

const director = saveAppointment({ name: 'Person One', roles: ['director', 'psc', 'invalid'] }).appointments[0];
assert.deepEqual(director.roles, ['director', 'psc'], 'Appointments must keep only supported unique roles');
assert.throws(() => saveAppointment({ name: 'No role', roles: [] }), /at least one appointment/);
const edited = saveAppointment({ id: director.id, name: 'Person One Updated', roles: ['director', 'shareholder'] });
assert.equal(edited.appointments.length, 1, 'Editing a person must not create a duplicate');
assert.equal(edited.appointments[0].name, 'Person One Updated');
assert.equal(deleteAppointment(director.id), true);
assert.equal(getCompanyProfile().appointments.length, 0);


const memberA = saveAppointment({ name: 'Investor A', roles: ['director'] }).appointments.at(-1);
const memberB = saveAppointment({ name: 'Investor B', roles: ['shareholder'] }).appointments.at(-1);
saveInvestment({ memberId: memberA.id, amount: '6000', date: '2026-10-01', reference: 'Initial funding' });
saveInvestment({ memberId: memberA.id, amount: 4000.5, date: '2026-10-10', reference: 'Second transfer' });
saveInvestment({ memberId: memberB.id, amount: 9999.5, date: '2026-10-11', reference: 'Shareholder loan' });
let investmentSummary = getInvestmentSummary();
assert.equal(investmentSummary.total, 20000);
assert.equal(investmentSummary.members.length, 2);
assert.equal(investmentSummary.members.find((member) => member.memberId === memberA.id).amount, 10000.5);
assert.equal(investmentSummary.members.find((member) => member.memberId === memberB.id).contributionPercentage, 49.9975);
assert.throws(() => saveInvestment({ memberId: memberB.id, amount: 0 }), /greater than £0/);
const firstInvestment = getCompanyProfile().investments[0];
const editedInvestment = saveInvestment({ ...firstInvestment, amount: 6500, reference: 'Updated funding note' });
assert.equal(editedInvestment.investments[0].amount, 6500, 'Editing an entry must update it without duplicating it');
assert.equal(editedInvestment.investments[0].reference, 'Updated funding note');
assert.equal(deleteInvestment(firstInvestment.id), true, 'Investment entries can be removed');
assert.equal(getCompanyProfile().investments.length, 2);
assert.equal(getInvestmentSummary().total, 14000);

let local = { ...created, _cloudDirty: true, _cloudRevision: 0 };
let uploadCount = 0;
const uploaded = await performCompanyProfileSync({
  getCompanyProfile: async () => null,
  upsertCompanyProfile: async (item) => {
    uploadCount += 1;
    return { ...item, _cloudDirty: false, _cloudRevision: 1, updatedAt: '2026-10-23T10:00:00Z' };
  }
}, {
  getLocal: () => local,
  replaceLocal: (item) => { local = item; }
});
assert.equal(uploadCount, 1, 'A dirty local profile must upload when cloud has no profile');
assert.equal(uploaded.changes, 1);
assert.equal(local._cloudDirty, false);
assert.equal(local._cloudRevision, 1);

local = null;
const downloaded = await performCompanyProfileSync({
  getCompanyProfile: async () => ({ ...created, _cloudDirty: false, _cloudRevision: 3 }),
  upsertCompanyProfile: async (item) => item
}, {
  getLocal: () => local,
  replaceLocal: (item) => { local = item; }
});
assert.equal(downloaded.changes, 1, 'A cloud profile must download to a new device');
assert.equal(local.companyName, created.companyName);

local = { ...created, _cloudDirty: true, _cloudRevision: 2 };
const conflict = await performCompanyProfileSync({
  getCompanyProfile: async () => ({ ...created, companyName: 'Cloud change', _cloudDirty: false, _cloudRevision: 3 }),
  upsertCompanyProfile: async (item) => item,
  isCompanyProfileConflict: () => true
}, {
  getLocal: () => local,
  replaceLocal: (item) => { local = item; }
});
assert.deepEqual(conflict.conflicts, ['default'], 'Concurrent changes must surface a conflict');
assert.equal(local.companyName, created.companyName, 'Conflicts must keep local changes untouched');

replaceCompanyProfile({ ...created, _cloudRevision: 4 });
assert.equal(getCompanyProfile()._cloudRevision, 4, 'Synced profile revision must persist locally');
assert.equal(getCompanyProfile()._cloudDirty, false);

console.log('Company particulars, appointments and sync checks passed.');
