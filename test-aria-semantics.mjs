import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const forecast = fs.readFileSync(new URL('./forecast/index.html', import.meta.url), 'utf8');
const users = fs.readFileSync(new URL('./admin/users/index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('./app-shell.js', import.meta.url), 'utf8');

assert.match(shell, /class="header-actions" role="group" aria-label="App controls"/, 'App control label must be attached to a group');
assert.match(index, /class="property-hero-actions" role="group" aria-label="Property actions"/, 'Property action label must be attached to a group');
assert.match(forecast, /class="forecast-periods" role="group" aria-label="Forecast period"/, 'Forecast period label must be attached to a group');
assert.match(app, /class="property-card-tools" role="group" aria-label="Property actions"/, 'Card action label must be attached to a group');

assert.doesNotMatch(app, /<summary[^>]*role="button"/, 'Native summary must not repeat its implicit button semantics');
assert.doesNotMatch(app, /role="menu(?:item)?"/, 'Card actions must not claim application-menu keyboard behaviour');
assert.doesNotMatch(app, /<summary[^>]*aria-haspopup="menu"/, 'Card disclosure must not claim to open an application menu');
assert.doesNotMatch(index, /role="log"[^>]*aria-live=/, 'Log role must rely on its implicit live-region behaviour');
assert.doesNotMatch(users, /role="status"[^>]*aria-live=/, 'Status role must rely on its implicit live-region behaviour');
assert.doesNotMatch(users, /class="user-list"[^>]*aria-label=/, 'Generic user list must not carry an ineffective accessible name');

console.log('ARIA semantics cleanup checks passed.');