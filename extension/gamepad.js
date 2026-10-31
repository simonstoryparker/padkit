// Runs in the page's main world before its game reads navigator.getGamepads.
(() => {
  'use strict';
  if (!PADKIT_CONFIG.powera) return;
  const marker = Symbol.for('powera.firstroboticsim.v1');
  if (window[marker] || typeof navigator.getGamepads !== 'function') return;
  window[marker] = true;
  const nativeGet = navigator.getGamepads.bind(navigator);
  let pad = null;
  function nativePads() { try { return Array.from(nativeGet()); } catch { return []; } }
  function event(type) {
    const notification = new Event(type);
    Object.defineProperty(notification, 'gamepad', { value: pad });
    window.dispatchEvent(notification);
  }
  function disconnect() {
    if (!pad?.connected) return;
    pad.connected = false;
    pad.axes = Object.freeze([0, 0, 0, 0]);
    pad.buttons = Object.freeze(Array.from({ length: 17 }, () => Object.freeze({ value: 0, pressed: false, touched: false })));
    event('gamepaddisconnected');
  }
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value() {
      const pads = nativePads();
      if (pad?.connected) {
        while (pads.length <= pad.index) pads.push(null);
        // A real controller arriving in this slot is preserved and gets priority.
        if (pads[pad.index] !== null && pads[pad.index] !== undefined) {
          disconnect();
        } else pads[pad.index] = pad;
      }
      return pads;
    },
  });
  window.addEventListener('message', (message) => {
    if (message.source !== window || message.origin !== location.origin || message.data?.channel !== 'powera-gamepad-v1') return;
    const state = document.documentElement?.getAttribute('data-padkit-owner') === 'native' ? null : message.data.state;
    if (!state || state.connected !== true) { disconnect(); return; }
    if (!Array.isArray(state.axes) || state.axes.length !== 4 || !state.axes.every(v => Number.isFinite(v) && Math.abs(v) <= 1) ||
        !Array.isArray(state.buttons) || state.buttons.length !== 17 || !state.buttons.every(v => Number.isFinite(v) && v >= 0 && v <= 1)) return;
    let newlyConnected = !pad?.connected;
    if (newlyConnected) {
      const native = nativePads();
      let index = native.findIndex(value => value === null || value === undefined);
      if (index < 0) index = native.length;
      pad = { id: 'PowerA FUSION Pro 2 (local USB adapter)', index, connected: true, mapping: 'standard',
        timestamp: performance.now(), axes: [], buttons: [], vibrationActuator: null, hapticActuators: [] };
    }
    pad.axes = Object.freeze([...state.axes]);
    pad.buttons = Object.freeze(state.buttons.map(value => Object.freeze({ value, pressed: value > 0.5, touched: value > 0 })));
    pad.timestamp = performance.now();
    if (newlyConnected) event('gamepadconnected');
  });
  window.addEventListener('pagehide', disconnect);
})();
