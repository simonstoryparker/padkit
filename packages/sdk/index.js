import { normalize, createActions } from '../core/index.js';
const key = Symbol.for('padkit.runtime.v1');
// The DOM marker crosses the isolated extension/page boundary. It is a coordination hint, not authorization.
export function claimControllerSupport({ source = 'gamepad' } = {}) {
  if (!['gamepad', 'native'].includes(source)) throw new Error('Unknown controller source');
  const root = document.documentElement;
  const state = window[key] ??= { claims: new Map() };
  const token = Symbol(); state.claims.set(token, source);
  const update = () => {
    if (state.claims.size) root.setAttribute('data-padkit-owner', [...state.claims.values()].includes('native') ? 'native' : 'gamepad');
    else root.removeAttribute('data-padkit-owner');
    window.dispatchEvent(new Event('padkit-owner-change'));
  };
  update(); let disposed = false;
  return () => { if (!disposed) { disposed = true; state.claims.delete(token); update(); } };
}
export function createController({ onAction = () => {}, onFrame = () => {}, bindings, calibration = {} } = {}) {
  const state = window[key] ??= { claims: new Map() };
  if (state.controller) throw new Error('A Padkit controller is already active; reuse it or dispose it first.');
  const release = claimControllerSupport(); const actions = createActions(bindings);
  let frame, stopped = false;
  const clear = () => { for (const event of actions([])) onAction(event); onFrame([]); };
  function tick() {
    if (stopped) return;
    frame = requestAnimationFrame(tick);
    const pads = document.visibilityState === 'visible' && document.hasFocus()
      ? Array.from(navigator.getGamepads?.() ?? []).filter(Boolean).map(p => normalize(p, calibration[p.id])).filter(Boolean) : [];
    onFrame(pads); for (const event of actions(pads)) onAction(event);
  }
  const blur = () => clear(); window.addEventListener('blur', blur);
  const controller = { dispose() { if (stopped) return; stopped = true; cancelAnimationFrame(frame); window.removeEventListener('blur', blur); clear(); release(); delete state.controller; } };
  state.controller = controller; frame = requestAnimationFrame(tick); return controller;
}
