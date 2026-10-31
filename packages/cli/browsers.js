import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
export const browsers = {
 chrome: { app: 'Google Chrome', folder: 'Google/Chrome' },
 'chrome-beta': { app: 'Google Chrome Beta', folder: 'Google/Chrome Beta' },
 'chrome-canary': { app: 'Google Chrome Canary', folder: 'Google/Chrome Canary' },
 arc: { app: 'Arc', folder: 'Arc/User Data' },
 dia: { app: 'Dia', folder: 'Dia/User Data' },
 brave: { app: 'Brave Browser', folder: 'BraveSoftware/Brave-Browser' },
 edge: { app: 'Microsoft Edge', folder: 'Microsoft Edge' },
 vivaldi: { app: 'Vivaldi', folder: 'Vivaldi' },
 chromium: { app: 'Chromium', folder: 'Chromium' },
 opera: { app: 'Opera', folder: 'com.operasoftware.Opera' },
 'opera-gx': { app: 'Opera GX', folder: 'com.operasoftware.OperaGX' },
 safari: { app: 'Safari' }, firefox: { app: 'Firefox' }, zen: { app: 'Zen' }, orion: { app: 'Orion' },
};
// Discover actual application bundles, not stale browser-data directories.
export function discoverBrowsers({ roots = ['/Applications', path.join(os.homedir(), 'Applications'), '/System/Applications'], inspect = inspectBundle } = {}) {
 const found = new Map();
 function scan(directory, depth = 0) {
  let entries; try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
   const location = path.join(directory, entry.name);
   if (entry.name.endsWith('.app')) {
    const known = Object.entries(browsers).find(([, b]) => entry.name === b.app + '.app');
    if (known) { const [id, b] = known; if (!found.has(id)) found.set(id, { id, ...b, location, supported: Boolean(b.folder) }); }
    else {
      const info = inspect(location);
      if (info?.browser) found.set(location, { id: location, app: info.name || entry.name.slice(0, -4), location, supported: false });
    }
   } else if (entry.isDirectory() && depth < 2) scan(location, depth + 1);
  }
 }
 roots.forEach(root => scan(root));
 return [...found.values()].sort((a,b) => a.app.localeCompare(b.app));
}
function inspectBundle(location) {
 try {
  const info = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(location, 'Contents/Info.plist')], { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }));
  return { name: info.CFBundleDisplayName || info.CFBundleName, browser: info.CFBundleDocumentTypes?.some(t => t.LSItemContentTypes?.includes('public.html') || t.CFBundleTypeExtensions?.includes('html')) && info.CFBundleURLTypes?.some(t => t.CFBundleURLSchemes?.includes('http') && t.CFBundleURLSchemes?.includes('https')) };
 } catch { return null; }
}
export function profiles(browser, home = os.homedir()) {
 const base = path.join(home, 'Library/Application Support', browsers[browser].folder);
 try {
  const local = JSON.parse(fs.readFileSync(path.join(base, 'Local State'), 'utf8'));
  return Object.entries(local.profile?.info_cache ?? {}).filter(([directory]) => /^(Default|Profile \d+)$/.test(directory)).map(([directory, p]) => ({ directory, name: p.name ?? directory }));
 } catch { return []; }
}
