import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const data = new Map();
globalThis.localStorage = {
  getItem: key => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, String(value))
};
const { saveCompanyProfile, getCompanyProfile, saveComplianceConfirmation, replaceCompanyProfile } =
  await import('../src/features/company/company-storage.js');
const { buildCompanyCompliance } = await import('../src/features/company/compliance-rules.js');
saveCompanyProfile({ companyName: 'Example SPV', companyNumber: '12345678' });
const requirement = buildCompanyCompliance({ today: '2026-11-02' }).find(item => item.id === 'director-identity');
saveComplianceConfirmation(requirement.key, true, '2026-11-02');
let saved = getCompanyProfile();
assert.equal(saved.complianceConfirmations[requirement.key].status, 'confirmed');
assert.equal(saved._cloudDirty, true, 'Confirmation must queue workspace sync');
assert.equal(buildCompanyCompliance({ today: '2026-11-02', confirmations: saved.complianceConfirmations }).find(item => item.id === 'director-identity').status, 'user-confirmed');
assert.throws(() => saveComplianceConfirmation('invalid:once', true, '2026-11-02'), /Unknown/);
assert.throws(() => saveComplianceConfirmation(requirement.key, true, '2026-02-30'), /valid/);
saveComplianceConfirmation(requirement.key, false, '');
assert.equal(getCompanyProfile().complianceConfirmations[requirement.key], undefined);
saveComplianceConfirmation(requirement.key, true, '2026-11-02');
saved = getCompanyProfile();
replaceCompanyProfile({ ...saved, _cloudRevision: 2 });
assert.equal(getCompanyProfile().complianceConfirmations[requirement.key].status, 'confirmed',
  'Remote profile replacement must retain compliance confirmations');
assert.equal(getCompanyProfile()._cloudDirty, false);
const cloud = readFileSync(new URL('../cloud.js', import.meta.url), 'utf8');
assert.match(cloud, /complianceConfirmations: record\?\.complianceConfirmations/, 'Cloud profile must carry confirmations');
const ui = readFileSync(new URL('../src/features/company/company.js', import.meta.url), 'utf8');
assert.match(ui, /data-compliance-key/);
assert.match(ui, /!editingAllowed/, 'View-only mode must not allow compliance edits');
assert.match(ui, /syncAfterSave\(\)/);
console.log('Company compliance confirmation persistence and shared-sync wiring passed.');
