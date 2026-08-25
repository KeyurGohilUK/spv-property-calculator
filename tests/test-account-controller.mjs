import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateAccountCredentials } from '../account-controller.js';

const app = fs.readFileSync(new URL('../src/app/app.js', import.meta.url), 'utf8');
const secondary = fs.readFileSync(new URL('../src/components/secondary-page-header.js', import.meta.url), 'utf8');
const controller = fs.readFileSync(new URL('../account-controller.js', import.meta.url), 'utf8');

assert.equal(validateAccountCredentials('', ''), 'Enter your email and password.');
assert.equal(validateAccountCredentials('user@example.com', 'secret'), '');
assert.equal(validateAccountCredentials('user@example.com', 'short', true), 'Enter a valid email and a password of at least 6 characters.');
assert.equal(validateAccountCredentials('user@example.com', 'secret', true), '');

assert.match(app, /setupAccountController\(\{/, 'Home must use the shared account controller');
assert.match(secondary, /setupAccountController\(\{/, 'Secondary pages must use the shared account controller');
assert.doesNotMatch(app, /window\.SPVCloud\.signIn\(/, 'Home must not maintain a separate sign-in implementation');
assert.doesNotMatch(secondary, /window\.SPVCloud\.signIn\(/, 'Secondary pages must not maintain a separate sign-in implementation');
assert.match(controller, /cloud\.signIn\(email, password\)/, 'Shared controller must own sign-in');
assert.match(controller, /cloud\.signUp\(email, password/, 'Shared controller must own account creation');
assert.match(controller, /cloud\.signOut\(\)/, 'Shared controller must own sign-out');
assert.match(controller, /cloud\.onAuthChange/, 'Shared controller must own authentication state changes');
assert.match(controller, /await cloud\.init\(\)/, 'Shared controller must own cloud initialisation');

console.log('Shared account controller checks passed.');
