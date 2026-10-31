import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { bundleContentScripts } from '../packages/cli/bundle.js';
test('each generated execution world boots independently without a config global', () => {
 const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'padkit-bundle-'));
 try {
  fs.cpSync('extension', folder, { recursive:true });
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json')));
  bundleContentScripts(folder, { powera:true, preset:'navigation' }, manifest);
  for (const entry of manifest.content_scripts) {
   assert.equal(entry.js.length, 1);
   let connections = 0, frames = 0;
   const context = vm.createContext({
    window: { addEventListener() {}, postMessage() {} },
    document: { visibilityState:'visible', documentElement: { getAttribute: () => null }, addEventListener() {} },
    navigator: { getGamepads: () => [] }, location: { origin:'https://frsim.com' },
    MutationObserver: class { observe() {} },
    requestAnimationFrame() { frames++; }, clearTimeout() {}, setTimeout() {},
    chrome: { runtime: { connect() { connections++; return { onMessage:{addListener() {}}, onDisconnect:{addListener() {}} }; } } },
    console,
   });
   vm.runInContext(fs.readFileSync(path.join(folder, entry.js[0]), 'utf8'), context);
   assert.equal(context.PADKIT_CONFIG, undefined);
   if (entry.world === 'ISOLATED') assert.equal(connections, 1, 'PowerA transport must actually start');
   else assert.equal(frames, 1, 'Navigation must actually start');
  }
 } finally { fs.rmSync(folder, { recursive:true }); }
});
