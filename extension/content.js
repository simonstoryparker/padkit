// Isolated extension context. No page messages are forwarded to native code.
(() => {
  let port = null, retry = null, leaving = false;
  const publish = state => window.postMessage({ channel: 'powera-gamepad-v1', state }, location.origin);
  function stop() {
    clearTimeout(retry); retry = null;
    const old = port; port = null;
    old?.disconnect();
    publish({ connected: false });
  }
  function start() {
    if (!PADKIT_CONFIG.powera || document.documentElement?.getAttribute('data-padkit-owner') === 'native' || leaving || document.visibilityState !== 'visible' || port) return;
    try {
      const current = chrome.runtime.connect({ name: 'powera-input-v1' });
      port = current;
      current.onMessage.addListener(message => {
        if (current !== port) return;
        if (message.type === 'state') publish(message);
        if (message.type === 'error') console.warn('[PowerA adapter]', message.message);
      });
      current.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        if (error) console.warn('[PowerA adapter]', error.message);
        if (current !== port) return;
        port = null; publish({ connected: false });
        if (!leaving && document.visibilityState === 'visible') retry = setTimeout(start, 1500);
      });
    } catch (error) {
      console.warn('[PowerA adapter]', error.message);
      publish({ connected: false });
    }
  }
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' ? start() : stop());
  window.addEventListener('pagehide', () => { leaving = true; stop(); });
  window.addEventListener('pageshow', () => { leaving = false; start(); });
  const observer = new MutationObserver(() => document.documentElement?.getAttribute('data-padkit-owner') === 'native' ? stop() : start());
  observer.observe(document, { subtree: true, attributes: true, attributeFilter: ['data-padkit-owner'] });
  start();
})();
