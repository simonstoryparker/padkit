import fs from 'node:fs';
import path from 'node:path';
// Each execution world gets its own lexical configuration in the same file as its consumers.
// Never rely on a separate content-script file creating a shared global.
export function bundleContentScripts(folder, target, manifest) {
 const config = JSON.stringify({ powera: Boolean(target.powera), preset: target.preset });
 const groups = [
  { world: 'MAIN', name: 'page.bundle.js', files: ['core.js', 'gamepad.js', 'navigation.js'] },
  { world: 'ISOLATED', name: 'content.bundle.js', files: ['content.js'] },
 ];
 for (const group of groups) {
  const source = group.files.map(file => fs.readFileSync(path.join(folder, file), 'utf8')).join('\n;\n');
  fs.writeFileSync(path.join(folder, group.name), `(() => {\nconst PADKIT_CONFIG = ${config};\n${source}\n})();\n`);
 }
 manifest.content_scripts = manifest.content_scripts.map(entry => {
  const group = groups.find(g => g.world === (entry.world ?? 'ISOLATED'));
  return { ...entry, world: group.world, js: [group.name] };
 });
}
