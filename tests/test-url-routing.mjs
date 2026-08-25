import assert from 'node:assert/strict';
import fs from 'node:fs';

const routes = [
  { clean: 'expenses/index.html', base: '../' },
  { clean: 'forecast/index.html', base: '../' },
  { clean: 'admin/users/index.html', base: '../../' }
];
const projectRoot = new URL('../', import.meta.url);

for (const route of routes) {
  const page = fs.readFileSync(new URL(route.clean, projectRoot), 'utf8');
  assert.match(page, new RegExp(`<base href="${route.base.replaceAll('.', '\\.')}">`), `${route.clean} must resolve shared assets from the app root`);
}

const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.shortcuts[0].url, './forecast/');

const appAssets = JSON.parse(fs.readFileSync(new URL('../app-assets.json', import.meta.url), 'utf8')).assets;
for (const path of ['./expenses/', './forecast/', './admin/users/']) {
  assert.ok(appAssets.includes(path), `${path} must be available offline`);
}

console.log('Clean URL routing checks passed.');
