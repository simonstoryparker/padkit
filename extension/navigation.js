(() => {
  if (PADKIT_CONFIG.preset !== 'navigation' || window[Symbol.for('padkit.navigation.v1')]) return;
  window[Symbol.for('padkit.navigation.v1')] = true;
  const { normalize, createActions } = window[Symbol.for('padkit.core.v1')];
  const actions = createActions(); let owned = false;
  function tick() {
    requestAnimationFrame(tick);
    owned = Boolean(document.documentElement?.getAttribute('data-padkit-owner'));
    const active = !owned && document.visibilityState === 'visible' && document.hasFocus();
    const pads = active ? Array.from(navigator.getGamepads()).filter(p => p?.mapping === 'standard').map(p => normalize(p)) : [];
    for (const { action, phase } of actions(pads)) {
      if (phase !== 'press') continue;
      const target = document.activeElement;
      if (target?.matches('input,textarea,select,[contenteditable="true"]')) continue;
      const elements = [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex="0"]')].filter(e => !e.disabled && e.getClientRects().length);
      if (action === 'confirm') target?.click();
      if (action === 'up' || action === 'down') window.scrollBy({ top: action === 'up' ? -200 : 200, behavior: 'smooth' });
      if (action === 'left' || action === 'right') { const i = elements.indexOf(target); elements[(i + (action === 'left' ? -1 : 1) + elements.length) % elements.length]?.focus(); }
    }
  }
  requestAnimationFrame(tick);
})();
