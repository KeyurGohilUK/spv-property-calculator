import assert from 'node:assert/strict';
import { requireWorkspaceMembership } from '../src/services/access-gate.js';

const entries = new Map();
const storage = {
  getItem: (key) => entries.get(key),
  setItem: (key, value) => entries.set(key, value),
  removeItem: (key) => entries.delete(key),
};
const user = { id: 'approved-test-user' };
let access;
const cloud = { getWorkspaceAccess: async () => access };
const check = (online = true, identity = user) =>
  requireWorkspaceMembership(identity, { cloud, storage, online });
for (access of [
  null,
  { active: false, role: 'editor' },
  { active: true, role: 'unknown' },
]) {
  assert.equal(await check(), false);
  assert.equal(await check(false), false);
}
for (const role of ['viewer', 'editor', 'admin']) {
  access = { active: true, role };
  assert.equal(await check(), true);
  assert.equal(await check(false), true);
}
assert.equal(await check(false, { id: 'another-user' }), false);
access = { active: false, role: 'editor' };
assert.equal(await check(), false);
assert.equal(
  await check(false),
  false,
  'Online revocation removes offline approval',
);
cloud.getWorkspaceAccess = async () => {
  throw new Error('Unavailable');
};
assert.equal(await check(), false, 'Online failures fail closed');
console.log('Onboarding membership and offline access checks passed.');
