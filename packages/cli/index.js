#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stateDir = process.env.PADKIT_HOME || path.join(root, '.local');
const configFile = path.join(stateDir, 'config.json');
const args = process.argv.slice(2);
const command = args.shift() || 'help';
function option(name, fallback) { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1]; }
function readConfig() { return fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : { targets: {} }; }
const browsers = {
 chrome: { app: 'Google Chrome', folder: 'Google/Chrome' },
 arc: { app: 'Arc', folder: 'Arc/User Data' },
 dia: { app: 'Dia', folder: 'Dia/User Data' },
};
export function siteOrigin(value) { const u = new URL(value); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('Use an HTTP(S) URL without credentials.'); return u.origin; }
function profiles(browser) {
 const base = path.join(os.homedir(), 'Library/Application Support', browsers[browser].folder);
 try { const local = JSON.parse(fs.readFileSync(path.join(base, 'Local State'), 'utf8')); return Object.entries(local.profile?.info_cache ?? {}).map(([directory, p]) => ({ directory, name: p.name ?? directory })); } catch { return []; }
}
function save(config) { fs.mkdirSync(stateDir, { recursive: true }); fs.writeFileSync(configFile + '.tmp', JSON.stringify(config, null, 2)); fs.renameSync(configFile + '.tmp', configFile); }
function generate(target) {
 const folder = path.join(stateDir, target.browser + '-' + target.profile, 'extension');
 fs.mkdirSync(folder, { recursive: true }); fs.cpSync(path.join(root, 'extension'), folder, { recursive: true });
 const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json')));
 const matches = target.sites.map(s => s + '/*');
 manifest.host_permissions = matches;
 manifest.content_scripts = matches.length ? manifest.content_scripts.map(s => ({ ...s, matches })) : [];
 fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2));
 fs.writeFileSync(path.join(folder, 'config.js'), 'globalThis.PADKIT_CONFIG = ' + JSON.stringify(target) + ';\n');
 return folder;
}
function instructions(target, folder) {
 console.log(`\nExtension prepared for ${target.browser} / ${target.profile}:\n${folder}\n\nIn that browser profile, open chrome://extensions, enable Developer mode, and choose Load unpacked. Select the folder above.\nFor updates, click Reload on Padkit and refresh the site.\nThis replaces the old PowerA extension in that profile (same extension ID); keep only one enabled.\nNo browser was launched or profile edited.`);
}
async function main() {
 if (command === 'help' || command === '--help') { console.log('padkit setup [--browser chrome|arc|dia] [--profile Default] [--site URL] [--preset gamepad|navigation] [--powera]\npadkit browsers\npadkit add URL [--browser NAME --profile DIR]\npadkit remove URL [--browser NAME --profile DIR]\npadkit status\npadkit doctor\npadkit uninstall [--browser NAME --profile DIR]\n\nNode 20+, macOS browser discovery. Setup is interactive when flags are omitted.\nConfigurations and generated extensions stay in .local (or PADKIT_HOME).'); return; }
 if (command === 'browsers') { for (const name of Object.keys(browsers)) console.log(name, JSON.stringify(profiles(name))); return; }
 const config = readConfig();
 if (command === 'status') { console.log(JSON.stringify(config, null, 2)); return; }
 if (command === 'doctor') {
   console.log(`Node ${process.version}; platform ${process.platform}`);
   const support = path.join(os.homedir(), 'Library/Application Support/PowerA Adapters');
   for (const name of ['input.sock', 'PowerABrowserHost']) console.log(`PowerA ${name}: ${fs.existsSync(path.join(support, name)) ? 'present' : 'missing (optional for standard controllers)'}`);
   const host = path.join(os.homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts/local.powera.browser.json');
   console.log(`Native host registration: ${fs.existsSync(host) ? 'present' : 'missing'}`);
   for (const t of Object.values(config.targets)) console.log(`${t.browser}/${t.profile}: ${t.sites.length} sites; ${t.preset}; PowerA ${t.powera ? 'on' : 'off'}`);
   console.log('Presence checks only. Verify controller input and native host discovery inside each browser.'); return;
 }
 if (!['setup', 'add', 'remove', 'uninstall'].includes(command)) throw new Error('Unknown command. Run padkit --help.');
 const interactive = command === 'setup' && process.stdin.isTTY;
 const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;
 try {
   const browser = (option('browser') ?? (interactive ? (await rl.question('Browser [chrome/arc/dia] (chrome): ')).trim() || 'chrome' : 'chrome'));
   if (!browsers[browser]) throw new Error('Choose chrome, arc, or dia.');
   if (interactive) console.log('Detected profiles:', profiles(browser));
   const profile = (option('profile') ?? (interactive ? (await rl.question('Profile directory (Default): ')).trim() || 'Default' : 'Default'));
   if (!/^(Default|Profile \d+)$/.test(profile)) throw new Error('Use a profile directory such as Default or Profile 1.');
   const id = browser + '/' + profile;
   if (command === 'uninstall') {
     const folder = path.join(stateDir, browser + '-' + profile);
     fs.rmSync(folder, { recursive: true, force: true }); delete config.targets[id]; save(config);
     console.log('Removed toolkit configuration. Remove Padkit in that browser profile’s extensions page. Shared PowerA service retained.'); return;
   }
   if (command !== 'setup' && !config.targets[id]) throw new Error('Run setup for this browser/profile first.');
   const target = config.targets[id] ?? { browser, profile, sites: [], preset: 'gamepad', powera: false };
   if (command === 'setup') {
     target.preset = (option('preset') ?? (interactive ? (await rl.question('Preset [gamepad/navigation] (gamepad): ')).trim() || 'gamepad' : target.preset));
     if (!['gamepad', 'navigation'].includes(target.preset)) throw new Error('Choose gamepad or navigation.');
     target.powera = args.includes('--powera') || (!args.includes('--no-powera') && (interactive ? /^y/i.test(await rl.question('Use the existing PowerA USB bridge? [y/N]: ')) : target.powera));
   }
   const value = command === 'setup' ? (option('site') ?? (interactive ? await rl.question('Site URL (blank to leave unchanged): ') : '')) : args[0];
   if (value) { const site = siteOrigin(value); target.sites = command === 'remove' ? target.sites.filter(s => s !== site) : [...new Set([...target.sites, site])]; }
   else if (command !== 'setup') throw new Error('Provide a site URL.');
   config.targets[id] = target;
   const folder = generate(target); save(config); instructions(target, folder);
   if (target.powera) console.log('PowerA requires the existing local.powera.browser native host and shared reader. Run doctor. Arc used Chrome’s host registry in the previous working setup; Dia must be verified.');
 } finally { rl?.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exitCode = 1; });
