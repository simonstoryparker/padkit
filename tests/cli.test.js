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
