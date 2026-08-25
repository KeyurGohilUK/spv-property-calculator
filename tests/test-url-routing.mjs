import assert from 'node:assert/strict';
import fs from 'node:fs';

const routes = [
  { clean: 'expenses/index.html', base: '../', legacy: 'expenses.html', target: './expenses/' },
  { clean: 'forecast/index.html', base: '../', legacy: 'forecast.html', target: './forecast/' },
  { clean: 'admin/users/index.html', base: '../../', legacy: 'manage-users.html', target: './admin/users/' }
];
const projectRoot = new URL('../', import.meta.url);

for (const route of routes) {
  const page = fs.readFileSync(new URL(route.clean, projectRoot), 'utf8');
  const redirect = fs.readFileSync(new URL(route.legacy, projectRoot), 'utf8');

  assert.match(page, new RegExp(`<base href="${route.base.replaceAll('.', '\\.')}">`), `${route.clean} must resolve shared assets from the app root`);
  assert.match(redirect, new RegExp(`http-equiv="refresh" content="0; url=${route.target.replaceAll('.', '\\.').replaceAll('/', '\\/')}"`), `${route.legacy} must provide a no-script redirect`);
  assert.match(redirect, /window\.location\.replace[\s\S]*window\.location\.search[\s\S]*window\.location\.hash/, `${route.legacy} must preserve query parameters and fragments`);
}

const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.shortcuts[0].url, './forecast/');

const worker = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
for (const path of ['./expenses/', './forecast/', './admin/users/']) {
  assert.match(worker, new RegExp(`'${path.replaceAll('/', '\\/')}'`), `${path} must be available offline`);
}

console.log('Clean URL routing checks passed.');
