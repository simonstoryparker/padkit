import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installationReceipt, launchArguments } from '../packages/cli/install.js';
test('extensions URL is a LaunchServices operand, not a startup-only argument', () => {
 assert.deepEqual(launchArguments('/Applications/Dia.app', 'Profile 4'), ['-a','/Applications/Dia.app','chrome://extensions/','--args','--profile-directory=Profile 4']);
});
test('receipt requires exact one-use URL and extension origin', async () => {
 const r = await installationReceipt({ timeout: 1000 });
 try {
  assert.equal((await fetch(r.url, { method:'POST' })).status, 403);
  assert.equal((await fetch(r.url + 'x', { method:'POST', headers:{ origin:'chrome-extension://ocbijffibhfpjbgpdahfklpgflkinhio' } })).status, 403);
  assert.equal((await fetch(r.url, { method:'POST', headers:{ origin:'chrome-extension://ocbijffibhfpjbgpdahfklpgflkinhio' } })).status, 204);
  assert.equal(await r.result, true);
 } finally { r.close(); }
});
test('receipt timeout ends cleanly without claiming success', async () => {
 const r = await installationReceipt({ timeout: 10 });
 try { assert.equal(await r.result, false); } finally { r.close(); }
});
