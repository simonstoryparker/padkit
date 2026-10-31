import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deadzone, normalize, createActions } from '../packages/core/index.js';
test('deadzone rejects noise, rescales endpoints, and handles malformed values', () => {
 assert.equal(deadzone(0.1), 0); assert.equal(deadzone(-1), -1); assert.equal(deadzone(1), 1); assert.equal(deadzone(NaN), 0);
});
test('nonstandard device remaps axes and buttons without device-name assumptions', () => {
 const p = normalize({ connected: true, id: 'generic', index: 0, axes: [0, 1], buttons: [{ value: 0 }, { value: 1 }] }, { axes: [1, 0], buttons: [1, 0] });
 assert.deepEqual(p.axes, [1, 0]); assert.deepEqual(p.buttons, [1, 0]); assert.equal(p.standard, false);
});
test('holding a button does not duplicate actions and disconnect releases it', () => {
 const actions = createActions({ confirm: 0 }); const pads = [{ buttons: [1] }];
 assert.deepEqual(actions(pads), [{ action: 'confirm', phase: 'press' }]); assert.deepEqual(actions(pads), []);
 assert.deepEqual(actions([]), [{ action: 'confirm', phase: 'release' }]);
});
