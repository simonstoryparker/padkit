import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
export function installNative(root, { home = os.homedir(), execute = spawnSync } = {}) {
 if (process.platform !== 'darwin') throw new Error('PowerA USB backend requires macOS.');
 const support = path.join(home, 'Library/Application Support/PowerA Adapters');
 const built = path.join(root, 'native/build');
 const run = (cmd, args, options = {}) => { const p = execute(cmd, args, { encoding:'utf8', ...options }); if (p.status !== 0) throw new Error(p.stderr || `${cmd} failed`); return p; };
 const existing = fs.existsSync(path.join(support, 'input.sock'));
 if (!existing || !fs.existsSync(path.join(support, 'PowerABrowserHost'))) {
  if (!fs.existsSync(path.join(built, 'PowerAInput')) || !fs.existsSync(path.join(built, 'PowerABrowserHost'))) run('/bin/sh', [path.join(root, 'native/build.sh')]);
  fs.mkdirSync(support, { recursive:true, mode:0o700 });
  for (const name of existing ? ['PowerABrowserHost'] : ['PowerAInput','PowerABrowserHost']) {
   fs.copyFileSync(path.join(built, name), path.join(support, name + '.new'));
   fs.chmodSync(path.join(support, name + '.new'), 0o755);
   fs.renameSync(path.join(support, name + '.new'), path.join(support, name));
  }
 }
 if (!existing) {
  const agents = path.join(home, 'Library/LaunchAgents'); fs.mkdirSync(agents, { recursive:true });
  const file = path.join(agents, 'local.powera.input.plist');
  if (fs.existsSync(file)) throw new Error('An existing PowerA launch agent needs repair. Retaining it; check launchctl before reinstalling.');
  const job = { Label:'local.powera.input', ProgramArguments:[path.join(support,'PowerAInput'),'--launchd'], Sockets:{ Input:{ SockPathName:path.join(support,'input.sock'), SockPathMode:384, SockType:'stream' } }, ThrottleInterval:1, ProcessType:'Interactive', StandardErrorPath:path.join(support,'Input.log') };
  run('/usr/bin/plutil', ['-convert','xml1','-o',file,'-'], { input:JSON.stringify(job) });
  run('/bin/launchctl', ['bootstrap', `gui/${process.getuid()}`, file]);
 }
 const registration = { name:'local.powera.browser', description:'Padkit PowerA USB bridge', path:path.join(support,'PowerABrowserHost'), type:'stdio', allowed_origins:['chrome-extension://ocbijffibhfpjbgpdahfklpgflkinhio/'] };
 for (const folder of ['Google/Chrome', 'Dia/User Data', 'Arc/User Data', 'BraveSoftware/Brave-Browser', 'Microsoft Edge', 'Vivaldi', 'Chromium']) {
  const base = path.join(home, 'Library/Application Support', folder);
  if (folder !== 'Google/Chrome' && !fs.existsSync(base)) continue;
  const directory = path.join(base,'NativeMessagingHosts'); fs.mkdirSync(directory, { recursive:true });
  const file = path.join(directory,'local.powera.browser.json');
  if (fs.existsSync(file)) { const prior = JSON.parse(fs.readFileSync(file)); if (prior.path !== registration.path) throw new Error('Existing native host registration has a different path: ' + file); }
  else fs.writeFileSync(file, JSON.stringify(registration,null,2)+'\n');
 }
 console.log(existing ? 'Using the existing PowerA service.' : 'Installed the on-demand PowerA USB service.');
}
