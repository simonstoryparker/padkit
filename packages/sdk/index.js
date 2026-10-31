import { normalize, createActions } from '../core/index.js';
const key = Symbol.for('padkit.runtime.v1');
const noop = () => {};
const getState = () => window[key] ??= { claims: new Map() };
// Coordination only: no polling, event interception, or permission changes.
export function claimControllerSupport({ source = 'gamepad' } = {}) {
  if (!['gamepad', 'native'].includes(source)) throw new Error('Unknown controller source');
  const state = getState(), token = Symbol();
  let disposed = false;
  function update() {
    const root = document.documentElement;
    if (state.claims.size) root?.setAttribute('data-padkit-owner', [...state.claims.values()].includes('native') ? 'native' : 'gamepad');
    else root?.removeAttribute('data-padkit-owner');
    window.dispatchEvent(new Event('padkit-owner-change'));
  }
  function activate() { if (!disposed) { state.claims.set(token, source); update(); } }
  function suspend() { state.claims.delete(token); update(); }
  activate();
  document.addEventListener('DOMContentLoaded', update);
  window.addEventListener('pagehide', suspend);
  window.addEventListener('pageshow', activate);
  return () => {
    if (disposed) return;
    disposed = true; suspend();
    document.removeEventListener('DOMContentLoaded', update);
    window.removeEventListener('pagehide', suspend);
    window.removeEventListener('pageshow', activate);
  };
}
function deliver(callback, value) {
  try { callback(value); } catch (error) {
    // A consumer exception must not strand ownership or prevent other consumers receiving releases.
    if (typeof globalThis.reportError === 'function') globalThis.reportError(error);
    else console.error(error);
  }
}
function createRuntime() {
  const subscribers = new Set();
  const release = claimControllerSupport();
  let frame, suspended = false, closed = false;
  function publish(raw) {
    for (const sub of [...subscribers]) {
      const pads = raw.map(p => normalize(p, sub.calibration[p.id])).filter(Boolean);
      for (const event of sub.actions(pads)) deliver(sub.onAction, event);
      if (subscribers.has(sub)) deliver(sub.onFrame, pads);
    }
  }
  function read() {
    if (suspended || document.visibilityState !== 'visible' || !document.hasFocus()) return [];
    return Array.from(navigator.getGamepads?.() ?? []).filter(p => p?.connected);
  }
  function tick() {
    if (closed || suspended) return;
    frame = requestAnimationFrame(tick);
    publish(read());
  }
  const clear = () => publish([]);
  const visibility = () => { if (document.visibilityState !== 'visible') clear(); };
  const hide = () => { suspended = true; cancelAnimationFrame(frame); clear(); };
  const show = () => { if (!suspended || closed) return; suspended = false; frame = requestAnimationFrame(tick); };
  const disconnect = event => publish(read().filter(p => p.index !== event.gamepad.index));
  window.addEventListener('blur', clear);
  window.addEventListener('gamepaddisconnected', disconnect);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  document.addEventListener('visibilitychange', visibility);
  frame = requestAnimationFrame(tick);
  return { subscribers, close() {
    closed = true; cancelAnimationFrame(frame); release();
    window.removeEventListener('blur', clear);
    window.removeEventListener('gamepaddisconnected', disconnect);
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', show);
    document.removeEventListener('visibilitychange', visibility);
  } };
}
export function createController({ onAction = noop, onFrame = noop, bindings = {}, calibration = {} } = {}) {
  const state = getState();
  // One poller per window, even when multiple components or copies of the SDK initialize it.
  const runtime = state.runtime ??= createRuntime();
  const signature = JSON.stringify({ bindings, calibration });
  let sub = [...runtime.subscribers].find(s => s.onAction === onAction && s.onFrame === onFrame && s.signature === signature);
  if (!sub) {
    sub = { onAction, onFrame, signature, calibration, actions: createActions(bindings), leases: 0 };
    runtime.subscribers.add(sub);
  }
  sub.leases++;
  let disposed = false;
  return { dispose() {
    if (disposed) return;
    disposed = true;
    if (--sub.leases === 0) {
      runtime.subscribers.delete(sub);
      if (!runtime.subscribers.size) { runtime.close(); delete state.runtime; }
      for (const event of sub.actions([])) deliver(onAction, event);
      deliver(onFrame, []);
    }
  } };
}
