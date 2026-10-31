'use strict';
importScripts('config.js');
const clients = new Set();
let native = null, latest = { type: 'state', connected: false }, retry = null;
function allowed(sender) {
  try {
    const url = new URL(sender.url);
    return (PADKIT_CONFIG.sites ?? []).includes(url.origin);
  } catch { return false; }
}
function broadcast(message) {
  for (const port of clients) { try { port.postMessage(message); } catch { clients.delete(port); } }
}
function valid(state) {
  return state?.type === 'state' && typeof state.connected === 'boolean' &&
    Array.isArray(state.axes) && state.axes.length === 4 && state.axes.every(v => Number.isFinite(v) && Math.abs(v) <= 1) &&
    Array.isArray(state.buttons) && state.buttons.length === 17 && state.buttons.every(v => Number.isFinite(v) && v >= 0 && v <= 1);
}
function connect() {
  clearTimeout(retry); retry = null;
  if (native || !clients.size) return;
  const host = chrome.runtime.connectNative('local.powera.browser');
  native = host;
  host.onMessage.addListener(state => {
    if (native !== host || !valid(state)) return;
    latest = state; broadcast(state);
  });
  host.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError;
    if (native !== host) return;
    native = null; latest = { type: 'state', connected: false }; broadcast(latest);
    if (error) { console.warn('[PowerA adapter]', error.message); broadcast({ type: 'error', message: error.message }); }
    if (clients.size) retry = setTimeout(connect, 2000);
  });
}
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'powera-input-v1' || !allowed(port.sender)) { port.disconnect(); return; }
  clients.add(port); port.postMessage(latest); connect();
  port.onDisconnect.addListener(() => {
    clients.delete(port);
    if (!clients.size) {
      clearTimeout(retry); retry = null;
      const old = native; native = null; old?.disconnect();
      latest = { type: 'state', connected: false };
    }
  });
});

// A generated one-use token lets the setup CLI confirm this bundle actually loaded.
if (PADKIT_CONFIG.installReceipt) {
  try {
    const receipt = new URL(PADKIT_CONFIG.installReceipt);
    if (receipt.protocol === 'http:' && receipt.hostname === '127.0.0.1' && /^\/[a-f0-9]{48}$/.test(receipt.pathname)) {
      fetch(receipt.href, { method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer' }).catch(() => {});
    }
  } catch { /* Stale or malformed setup receipts never affect controller support. */ }
}
