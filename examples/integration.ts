import { claimControllerSupport, createController, type ControllerState } from '@simonstoryparker/padkit';
import { normalize } from '@simonstoryparker/padkit/core';

// Existing controller implementation: declaration + cleanup.
export function mountExistingControllerApp() {
  return claimControllerSupport();
}

// New controller implementation: initialization + callbacks + cleanup.
export function mountNewControllerApp(render: (pads: ControllerState[]) => void) {
  const controller = createController({
    onFrame: render,
    // Optional: omit these two properties to keep your own mapping logic.
    bindings: { confirm: 0 },
    onAction(event) { console.log(event.action, event.phase); }
  });
  return () => controller.dispose();
}

// The browser object is available for native APIs and existing mapping code.
export function inspectRawInput(state: ControllerState) {
  const raw: Gamepad = state.raw;
  return normalize(raw, { threshold: 0.1 });
}
