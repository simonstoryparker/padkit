import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stateDirectory } from '../packages/cli/state.js';
test('state survives install-root changes and migrates only once', () => {
 const home = fs.mkdtempSync(path.join(os.tmpdir(),'padkit-state-'));
 try {
  const root=path.join(home,'checkout');fs.mkdirSync(path.join(root,'.local'),{recursive:true});
  fs.writeFileSync(path.join(root,'.local/config.json'),'{"targets":{}}');
  const stable=stateDirectory(root,{},home);
  assert.equal(stable,stateDirectory(path.join(home,'new-version'),{},home));
  assert.equal(fs.readFileSync(path.join(stable,'config.json'),'utf8'),'{"targets":{}}');
  fs.writeFileSync(path.join(root,'.local/config.json'),'old');
  stateDirectory(root,{},home);
  assert.equal(fs.readFileSync(path.join(stable,'config.json'),'utf8'),'{"targets":{}}');
  assert.equal(stateDirectory(root,{PADKIT_HOME:'/tmp/override'},home),'/tmp/override');
 } finally {fs.rmSync(home,{recursive:true});}
});
