import { emitKeypressEvents } from 'node:readline';
import { createInterface } from 'node:readline/promises';
const cyan = text => process.stdout.isTTY ? `\x1b[36m${text}\x1b[0m` : text;
export async function select(label, choices, initial) {
  if (!choices.length) throw new Error(`No choices available for ${label}.`);
  const input = process.stdin, output = process.stdout;
  let index = Math.max(0, choices.findIndex(c => c.value === initial));
  emitKeypressEvents(input);
  const wasRaw = input.isRaw;
  input.setRawMode(true); input.resume();
  let lines = 0;
  function draw(done = false) {
    if (lines) output.write(`\x1b[${lines}A\r\x1b[J`);
    const rows = done ? [`  ${cyan('✓')} ${label}  ${choices[index].label}`] : [
      `  ${cyan('?')} ${label}`, ...choices.map((c, i) => `    ${i === index ? cyan('❯ ' + c.label) : '  ' + c.label}`),
      '    ↑ ↓ move · Enter select · Ctrl+C cancel',
    ];
    output.write(rows.join('\n') + '\n'); lines = rows.length;
  }
  output.write('\x1b[?25l'); draw();
  return new Promise((resolve, reject) => {
    function cleanup() { input.off('keypress', keypress); input.setRawMode(Boolean(wasRaw)); input.pause(); output.write('\x1b[?25h'); }
    function keypress(_, key = {}) {
      if (key.ctrl && key.name === 'c' || key.name === 'escape') { cleanup(); output.write('\n'); reject(new Error('Setup cancelled.')); return; }
      if (key.name === 'up' || key.name === 'down') { index = (index + (key.name === 'up' ? -1 : 1) + choices.length) % choices.length; draw(); }
      if (key.name === 'return') { draw(true); cleanup(); resolve(choices[index].value); }
    }
    input.on('keypress', keypress);
  });
}
export async function text(label) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return await rl.question(`  ${cyan('?')} ${label}: `); } finally { rl.close(); }
}
export async function validatedSite(parse, initial, ask = text, report = console.log) {
  let value = initial;
  for (;;) {
    value ??= await ask('Site (e.g. frsim.com; blank to skip)');
    if (!value.trim()) return '';
    try { return parse(value); }
    catch { report('    Please enter a domain or HTTP(S) URL, such as frsim.com or http://localhost:5173.'); value = undefined; }
  }
}
