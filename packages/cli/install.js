import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export async function installationReceipt({ timeout = 120000 } = {}) {
 const token = randomBytes(24).toString('hex');
 let finish, timer, used = false;
 const result = new Promise(resolve => { finish = resolve; });
 const server = http.createServer((req, res) => {
   if (used || req.method !== 'POST' || req.url !== '/' + token || req.headers.origin !== 'chrome-extension://ocbijffibhfpjbgpdahfklpgflkinhio') { res.writeHead(403).end(); return; }
   used = true; req.resume(); res.writeHead(204).end(); finish(true);
 });
 await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
 timer = setTimeout(() => finish(false), timeout);
 return { url: `http://127.0.0.1:${server.address().port}/${token}`, result,
   close() { clearTimeout(timer); finish(false); server.close(); server.closeAllConnections(); } };
}
export function launchArguments(app, profile) {
 // URLs before --args are delivered through LaunchServices even to a running app.
 // Startup-only arguments are ignored by an already-running browser.
 return ['-a', app, 'chrome://extensions/', '--args', `--profile-directory=${profile}`];
}
export async function assistInstall(target, folder, app, { run = spawnSync, log = console.log, timeout } = {}) {
 if (process.platform !== 'darwin') { log('Guided installation currently supports macOS. Load the printed folder manually.'); return; }
 const receipt = await installationReceipt({ timeout });
 const configPath = path.join(folder, 'config.js');
 // One-use, loopback-only receipt. Never forwarded to the PowerA host.
 fs.writeFileSync(configPath, 'globalThis.PADKIT_CONFIG = ' + JSON.stringify({ ...target, installReceipt: receipt.url }) + ';\n');
 const manifestPath = path.join(folder, 'manifest.json');
 const manifest = JSON.parse(fs.readFileSync(manifestPath));
 manifest.host_permissions.push('http://127.0.0.1/*');
 fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
 const interrupt = () => receipt.close();
 process.once('SIGINT', interrupt);
 try {
   const copied = run('/usr/bin/pbcopy', [], { input: folder, encoding: 'utf8' });
   log(copied.status === 0 ? '\n  ✓ Extension folder copied to clipboard.' : '\n  Clipboard unavailable; use the printed folder path.');
   run('/usr/bin/open', ['-R', folder], { encoding: 'utf8' });
   const opened = run('/usr/bin/open', launchArguments(app.location, target.profile), { encoding: 'utf8' });
   if (opened.status !== 0) { log('Could not open the extensions page. In the selected browser profile, enter chrome://extensions/ in the address bar.'); }
   else {
     log(`  Sent chrome://extensions/ to ${app.app}. If it was already running, select profile ${target.profile} in the browser.`);

   }
   log('  One Padkit extension handles all sites in this profile.\n  First install: enable Developer mode → Load unpacked → ⌘⇧G → ⌘V → Enter → Select.\n  For an existing Padkit install, click Reload. Check that you are in the selected profile.\n  Waiting up to two minutes for the extension to confirm it loaded… (Ctrl+C stops waiting)');
   const connected = await receipt.result;
   log(connected ? '  ✓ Padkit connected using this setup configuration. Refresh your site to use it.' : '  No connection confirmed yet. Your setup is saved; finish loading the extension manually or rerun setup.');
   return connected;
 } finally { process.removeListener('SIGINT', interrupt); receipt.close(); }
}
