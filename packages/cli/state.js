import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
export function stateDirectory(root, env = process.env, home = os.homedir()) {
 if (env.PADKIT_HOME) return env.PADKIT_HOME;
 const destination = path.join(home, 'Library/Application Support/Padkit');
 const legacy = path.join(root, '.local');
 if (!fs.existsSync(path.join(destination, 'config.json')) && fs.existsSync(path.join(legacy, 'config.json'))) {
  fs.mkdirSync(destination, { recursive:true });
  fs.cpSync(legacy, destination, { recursive:true });
  console.log('Migrated settings to ' + destination + '. Load the extension from this new stable folder once; the previous folder is retained.');
 }
 return destination;
}
