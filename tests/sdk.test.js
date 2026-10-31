import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimControllerSupport, createController } from '../packages/sdk/index.js';
test('claims survive repeated mounts, native takes priority, and duplicate runtimes are rejected', () => {
 const attributes = new Map(); globalThis.window = new EventTarget();
 globalThis.document = { documentElement: { setAttribute: (k,v) => attributes.set(k,v), removeAttribute: k => attributes.delete(k) } };
 globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {};
 const a = claimControllerSupport(); const b = claimControllerSupport({ source: 'native' });
 assert.equal(attributes.get('data-padkit-owner'), 'native'); b(); assert.equal(attributes.get('data-padkit-owner'), 'gamepad'); b(); a(); assert.equal(attributes.size, 0);
 const c = createController(); assert.throws(() => createController(), /already active/); c.dispose(); assert.equal(attributes.size, 0); createController().dispose();
});
