import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installNative } from '../packages/cli/native.js';
test('fresh install packages both binaries and a user socket-activated job', {skip:process.platform !== 'darwin'}, () => {
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'padkit-native-'));
 const root=path.join(home,'source');fs.mkdirSync(path.join(root,'native/build'),{recursive:true});
 for(const name of ['PowerAInput','PowerABrowserHost'])fs.writeFileSync(path.join(root,'native/build',name),'fixture');
 const calls=[];
 try {
  installNative(root,{home,execute(cmd,args,options){calls.push({cmd,args,options});return {status:0};}});
  const job=JSON.parse(calls.find(c=>c.cmd.endsWith('plutil')).options.input);
  assert.equal(job.Label,'local.powera.input');assert.equal(job.Sockets.Input.SockPathMode,384);
  assert.ok(calls.some(c=>c.args[0]==='bootstrap'));
  const host=JSON.parse(fs.readFileSync(path.join(home,'Library/Application Support/Google/Chrome/NativeMessagingHosts/local.powera.browser.json')));
  assert.equal(host.allowed_origins.length,1);assert.ok(fs.existsSync(host.path));
 } finally {fs.rmSync(home,{recursive:true});}
});
