#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { browsers, discoverBrowsers, profiles } from './browsers.js';
import { select, validatedSite } from './prompts.js';
import { assistInstall } from './install.js';
import { bundleContentScripts } from './bundle.js';
import { stateDirectory } from './state.js';
import { installNative } from './native.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let stateDir, configFile;
const args = process.argv.slice(2);
const command = args.shift() || 'help';
function option(name, fallback) { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1]; }
function readConfig() { return fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : { targets: {} }; }
export function siteOrigin(value) {
 const input = value.trim();
 if (!input || /\s/.test(input) || input.includes('\\')) throw new Error('Enter a domain or HTTP(S) URL.');
 const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(input) && !/^(localhost|[a-z0-9.-]+\.[a-z]+):\d+(?:[/?#]|$)/i.test(input);
 const u = new URL(hasScheme ? input : 'https://' + input);
 if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || !u.hostname || (!u.hostname.includes('.') && u.hostname !== 'localhost' && !u.hostname.startsWith('['))) throw new Error('Use a domain or HTTP(S) URL without credentials.');
 return u.origin;
}
function save(config) { fs.mkdirSync(stateDir, { recursive: true }); fs.writeFileSync(configFile + '.tmp', JSON.stringify(config, null, 2)); fs.renameSync(configFile + '.tmp', configFile); }
function generate(target) {
 const folder = path.join(stateDir, target.browser + '-' + target.profile, 'extension');
 fs.mkdirSync(folder, { recursive: true }); fs.cpSync(path.join(root, 'extension'), folder, { recursive: true });
 const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json')));
 const matches = target.sites.map(s => s + '/*');
 manifest.host_permissions = matches;
 manifest.content_scripts = matches.length ? manifest.content_scripts.map(s => ({ ...s, matches })) : [];
 bundleContentScripts(folder, target, manifest);
 fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2));
 fs.writeFileSync(path.join(folder, 'config.js'), 'globalThis.PADKIT_CONFIG = ' + JSON.stringify(target) + ';\n');
 return folder;
}
function instructions(target, folder, existing) {
 console.log(`\n${existing ? 'Updated' : 'Prepared'} Padkit for ${target.browser} / ${target.profile} (${target.sites.length} sites):\n${folder}\n\nOne extension handles every enabled site in this profile.\n${existing ? 'If Padkit is already installed, click Reload on its existing card, then refresh your site. No new extension is needed.' : 'Open chrome://extensions in this profile, enable Developer mode, choose Load unpacked, and select the folder above.'}\nIf this is your first install, use Load unpacked once. The older PowerA extension shares this ID; keep only one enabled.`);
}
async function main() {
 if (command === 'native-install') { installNative(root); return; }
 if (command === 'help' || command === '--help') { console.log('padkit setup [--browser NAME] [--profile Default] [--site URL] [--preset gamepad|navigation] [--powera] [--no-open | --install]\npadkit browsers\npadkit add URL [--browser NAME --profile DIR]\npadkit remove URL [--browser NAME --profile DIR]\npadkit status\npadkit doctor\npadkit uninstall [--browser NAME --profile DIR]\n\nNode 20+, macOS browser discovery. Setup is interactive when flags are omitted.\nConfigurations and extensions stay in ~/Library/Application Support/Padkit (or PADKIT_HOME).\npadkit native-install installs the optional PowerA backend.'); return; }
 if (command === 'browsers') { for (const b of discoverBrowsers()) console.log(`${b.app} (${b.id})${b.supported ? '' : ' — extension not supported'}`, b.supported ? profiles(b.id).map(p => `${p.name} (${p.directory})`).join(', ') : ''); return; }
 stateDir = stateDirectory(root);
 configFile = path.join(stateDir, 'config.json');
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
 if (interactive) console.log('\n  PADKIT  /  Controller setup\n');
 {
   const installed = interactive ? discoverBrowsers() : [];
   if (interactive) {
     const unsupported = installed.filter(b => !b.supported);
     if (unsupported.length) console.log('  Detected but not supported by this extension: ' + unsupported.map(b => b.app).join(', ') + '\n');
     if (!installed.some(b => b.supported)) throw new Error('No supported browsers found in Applications. Install a Chromium browser or use --browser for a custom installation.');
   }
   const browser = option('browser') ?? (interactive ? await select('Browser', installed.filter(b => b.supported).map(b => ({ value: b.id, label: b.app }))) : 'chrome');
   if (!browsers[browser]?.folder) throw new Error('Unsupported browser. Run padkit browsers to see installed browsers.');
   if (interactive && !installed.some(b => b.id === browser)) throw new Error('That browser was not found in Applications.');
   const availableProfiles = interactive ? profiles(browser) : [];
   if (interactive && !availableProfiles.length && !option('profile')) throw new Error('No profiles found. Open this browser once to create a profile, then rerun setup.');
   const profile = option('profile') ?? (interactive ? await select('Profile', availableProfiles.map(p => ({ value: p.directory, label: `${p.name} · ${p.directory}` }))) : 'Default');
   if (!/^(Default|Profile \d+)$/.test(profile)) throw new Error('Use a profile directory such as Default or Profile 1.');
   const id = browser + '/' + profile;
   if (command === 'uninstall') {
     const folder = path.join(stateDir, browser + '-' + profile);
     fs.rmSync(folder, { recursive: true, force: true }); delete config.targets[id]; save(config);
     console.log('Removed toolkit configuration. Remove Padkit in that browser profile’s extensions page. Shared PowerA service retained.'); return;
   }
   if (command !== 'setup' && !config.targets[id]) throw new Error('Run setup for this browser/profile first.');
   const existing = Boolean(config.targets[id]);
   const target = config.targets[id] ?? { browser, profile, sites: [], preset: 'gamepad', powera: false };
   if (command === 'setup') {
     target.preset = (option('preset') ?? (interactive ? await select('Controls', [{value:'gamepad', label:'Gamepad — use the site’s own controls'}, {value:'navigation', label:'Navigation — scroll, focus and activate'}], target.preset) : target.preset));
     if (!['gamepad', 'navigation'].includes(target.preset)) throw new Error('Choose gamepad or navigation.');
     target.powera = args.includes('--powera') || (!args.includes('--no-powera') && (interactive ? await select('PowerA USB bridge', [{ value: true, label: 'Use existing bridge — PowerA FUSION Pro 2' }, { value: false, label: 'Off — use browser-recognized controllers' }], target.powera) : target.powera));
   }
   if (command === 'setup' && target.powera && !process.env.PADKIT_HOME) installNative(root);
   const value = command === 'setup' ? (interactive ? await validatedSite(siteOrigin, option('site')) : option('site', '')) : args[0];
   if (value) { const site = siteOrigin(value); target.sites = command === 'remove' ? target.sites.filter(s => s !== site) : [...new Set([...target.sites, site])]; }
   else if (command !== 'setup') throw new Error('Provide a site URL.');
   config.targets[id] = target;
   const folder = generate(target); save(config); instructions(target, folder, existing);
   if (command === 'setup' && !args.includes('--no-open') && (interactive || args.includes('--install'))) {
     const app = (installed.length ? installed : discoverBrowsers()).find(b => b.id === browser);
     if (app) await assistInstall(target, folder, app);
     else console.log('Browser application not found; follow the manual instructions above.');
   }
   if (target.powera) console.log('PowerA requires the existing local.powera.browser native host and shared reader. Run doctor. Arc used Chrome’s host registry in the previous working setup; Dia must be verified.');
 }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exitCode = 1; });
