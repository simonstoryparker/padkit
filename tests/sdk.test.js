import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimControllerSupport, createController } from '../packages/sdk/index.js';
function environment() {
 const attributes = new Map(), frames = new Map(); let next = 0, pads = [];
 globalThis.window = new EventTarget(); globalThis.document = new EventTarget();
 Object.assign(document, { visibilityState: 'visible', hasFocus: () => true, documentElement: { setAttribute: (k,v) => attributes.set(k,v), removeAttribute: k => attributes.delete(k) } });
 Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => pads } });
 globalThis.requestAnimationFrame = callback => { frames.set(++next, callback); return next; };
 globalThis.cancelAnimationFrame = id => frames.delete(id);
 return { attributes, frames, setPads(p) { pads = p; }, tick() { const batch = [...frames.values()]; frames.clear(); batch.forEach(f => f()); } };
}
const pad = { connected: true, index: 0, id: 'test', mapping: 'standard', axes: [1], buttons: [{ value: 1 }] };
test('declaration alone never polls; overlapping claims and page restoration preserve ownership', () => {
 const e = environment(); const a = claimControllerSupport(); const b = claimControllerSupport({ source: 'native' });
 assert.equal(e.frames.size, 0); assert.equal(e.attributes.get('data-padkit-owner'), 'native');
 window.dispatchEvent(new Event('pagehide')); assert.equal(e.attributes.size, 0);
 window.dispatchEvent(new Event('pageshow')); assert.equal(e.attributes.get('data-padkit-owner'), 'native');
 b(); b(); assert.equal(e.attributes.get('data-padkit-owner'), 'gamepad'); a(); assert.equal(e.attributes.size, 0);
});
test('duplicate setup shares polling and callbacks; each lease cleans up independently', () => {
 const e = environment(), events = []; const options = { bindings: { go: 0 }, onAction: event => events.push(event.phase) };
 const a = createController(options), b = createController(options);
 e.setPads([pad]); e.tick(); assert.equal(e.frames.size, 1); assert.deepEqual(events, ['press']);
 a.dispose(); a.dispose(); e.tick(); assert.deepEqual(events, ['press']);
 b.dispose(); assert.deepEqual(events, ['press', 'release']); assert.equal(e.frames.size, 0); assert.equal(e.attributes.size, 0);
});
test('raw input is preserved and action mappings are optional', () => {
 const e = environment(); let received; const events = [];
 const c = createController({ onFrame: p => received = p, onAction: x => events.push(x) });
 e.setPads([pad]); e.tick(); assert.equal(received[0].raw, pad); assert.deepEqual(events, []); c.dispose();
});
test('focus, visibility, disconnection and pagehide release immediately; pageshow resumes one loop', () => {
 const e = environment(), events = []; const c = createController({ bindings: { go: 0 }, onAction: x => events.push(x.phase) });
 e.setPads([pad]); e.tick();
 window.dispatchEvent(new Event('blur')); assert.deepEqual(events, ['press', 'release']);
 e.tick(); document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); assert.equal(events.at(-1), 'release');
 document.visibilityState = 'visible'; e.tick();
 const disconnected = new Event('gamepaddisconnected'); disconnected.gamepad = pad; window.dispatchEvent(disconnected); assert.equal(events.at(-1), 'release');
 e.tick(); window.dispatchEvent(new Event('pagehide')); assert.equal(events.at(-1), 'release'); assert.equal(e.frames.size, 0);
 window.dispatchEvent(new Event('pageshow')); window.dispatchEvent(new Event('pageshow')); assert.equal(e.frames.size, 1); e.tick(); c.dispose();
});
test('independent consumers share polling without stealing each other’s cleanup', () => {
 const e = environment(); let count = 0;
 const a = createController(), b = createController({ onFrame: () => count++ }); a.dispose(); e.tick(); assert.equal(count, 1); assert.equal(e.frames.size, 1); b.dispose();
});
