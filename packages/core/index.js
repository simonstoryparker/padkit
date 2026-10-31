export function deadzone(value, threshold = 0.15) {
  if (!Number.isFinite(value)) return 0;
  threshold = Math.max(0, Math.min(0.95, threshold));
  return Math.abs(value) <= threshold ? 0 : Math.sign(value) * Math.min(1, (Math.abs(value) - threshold) / (1 - threshold));
}
export function normalize(pad, { threshold = 0.15, buttons, axes } = {}) {
  if (!pad?.connected) return null;
  return { raw: pad, id: pad.id, index: pad.index, standard: pad.mapping === 'standard',
    axes: (axes ?? Array.from(pad.axes, (_, i) => i)).map(i => deadzone(pad.axes[i], threshold)),
    buttons: (buttons ?? Array.from(pad.buttons, (_, i) => i)).map(i => {
      const b = pad.buttons[i]; return Math.max(0, Math.min(1, typeof b === 'number' ? b : b?.value ?? 0));
    }), vibration: Boolean(pad.vibrationActuator) };
}
export function createActions(bindings = { confirm: 0, back: 1, up: 12, down: 13, left: 14, right: 15 }) {
  let previous = new Set();
  return pads => {
    const current = new Set(Object.entries(bindings).filter(([, button]) => pads.some(p => p?.buttons[button] > 0.5)).map(([action]) => action));
    const events = [...current].filter(a => !previous.has(a)).map(action => ({ action, phase: 'press' }));
    for (const action of previous) if (!current.has(action)) events.push({ action, phase: 'release' });
    previous = current; return events;
  };
}
