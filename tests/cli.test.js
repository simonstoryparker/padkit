import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { siteOrigin } from '../packages/cli/index.js';
test('URL permissions reject unsafe schemes and remove paths', () => { assert.equal(siteOrigin('https://example.com/a'), 'https://example.com'); assert.throws(() => siteOrigin('file:///etc/passwd')); assert.throws(() => siteOrigin('https://user:pass@example.com')); });
test('setup, repeat setup, add/remove and uninstall remain profile scoped', () => {
 const home = mkdtempSync(path.join(os.tmpdir(), 'padkit-'));
 const cli = (...args) => { const p = spawnSync(process.execPath, ['packages/cli/index.js', ...args], { env: { ...process.env, PADKIT_HOME: home }, encoding: 'utf8' }); assert.equal(p.status, 0, p.stderr); return p.stdout; };
 try {
 cli('setup', '--browser', 'arc', '--profile', 'Profile 1', '--site', 'https://example.com/a');
 cli('setup', '--browser', 'arc', '--profile', 'Profile 1', '--site', 'https://example.com/b');
 let c = JSON.parse(readFileSync(path.join(home, 'config.json'))); assert.equal(c.targets['arc/Profile 1'].sites.length, 1);
 cli('add', 'http://localhost:5173', '--browser', 'arc', '--profile', 'Profile 1');
 let m = JSON.parse(readFileSync(path.join(home, 'arc-Profile 1/extension/manifest.json'))); assert.equal(m.host_permissions.length, 2);
 cli('remove', 'https://example.com', '--browser', 'arc', '--profile', 'Profile 1');
 cli('uninstall', '--browser', 'arc', '--profile', 'Profile 1');
 assert.deepEqual(JSON.parse(readFileSync(path.join(home, 'config.json'))).targets, {});
 } finally { rmSync(home, { recursive: true }); }
});

test('bare domains normalize to HTTPS and malformed input is rejected', () => {
 for (const value of ['frsim.com', ' frsim.com ', 'frsim.com/path']) assert.equal(siteOrigin(value), 'https://frsim.com');
 assert.equal(siteOrigin('localhost:5173'), 'https://localhost:5173');
 assert.equal(siteOrigin('http://localhost:5173'), 'http://localhost:5173');
 for (const value of ['not a url', 'nope', 'https://', 'javascript:alert(1)', 'ftp://example.com', 'https://user:pass@example.com']) assert.throws(() => siteOrigin(value));
});

test('interactive URL validation retries without losing the setup', async () => {
 const { validatedSite } = await import('../packages/cli/prompts.js');
 const answers = ['bad input', 'frsim.com']; let errors = 0;
 assert.equal(await validatedSite(siteOrigin, 'https://', async () => answers.shift(), () => errors++), 'https://frsim.com');
 assert.equal(errors, 2);
 assert.equal(await validatedSite(siteOrigin, '', async () => { throw Error('Should not ask'); }), '');
});

test('browser discovery lists installed bundles only, including user Applications', async () => {
 const { discoverBrowsers } = await import('../packages/cli/browsers.js');
 const { mkdirSync } = await import('node:fs');
 const home = mkdtempSync(path.join(os.tmpdir(), 'padkit-browsers-'));
 try {
  for (const folder of ['Applications/Dia.app', 'Applications/Safari.app', 'UserApps/Arc.app', 'Applications/Unrelated.app']) mkdirSync(path.join(home, folder), { recursive: true });
  const found = discoverBrowsers({ roots: [path.join(home, 'Applications'), path.join(home, 'UserApps')], inspect: () => null });
  assert.deepEqual(found.map(b => b.id), ['arc', 'dia', 'safari']);
  assert.deepEqual(found.filter(b => b.supported).map(b => b.id), ['arc', 'dia']);
 } finally { rmSync(home, { recursive: true }); }
});

test('many sites reuse one extension folder and identity per profile', async () => {
 const { readdirSync } = await import('node:fs');
 const home = mkdtempSync(path.join(os.tmpdir(), 'padkit-single-'));
 const cli = (...args) => {
  const p = spawnSync(process.execPath, ['packages/cli/index.js', ...args], { env: { ...process.env, PADKIT_HOME: home }, encoding: 'utf8' });
  assert.equal(p.status, 0, p.stderr); return p.stdout;
 };
 const readManifest = profile => JSON.parse(readFileSync(path.join(home, `dia-${profile}/extension/manifest.json`)));
 try {
  cli('setup', '--browser', 'dia', '--profile', 'Profile 4', '--site', 'frsim.com');
  const original = readManifest('Profile 4');
  const output = cli('setup', '--browser', 'dia', '--profile', 'Profile 4', '--site', 'example.com');
  assert.match(output, /No new extension is needed/);
  cli('add', 'another.example', '--browser', 'dia', '--profile', 'Profile 4');
  assert.deepEqual(readManifest('Profile 4').host_permissions, ['https://frsim.com/*', 'https://example.com/*', 'https://another.example/*']);
  assert.equal(readManifest('Profile 4').key, original.key);
  assert.deepEqual(readdirSync(path.join(home, 'dia-Profile 4')), ['extension']);
  cli('setup', '--browser', 'dia', '--profile', 'Default', '--site', 'other.example');
  assert.deepEqual(readManifest('Default').host_permissions, ['https://other.example/*']);
  assert.equal(readManifest('Profile 4').host_permissions.length, 3);
 } finally { rmSync(home, { recursive: true }); }
});
