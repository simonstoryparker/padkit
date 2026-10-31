# SDK development

## Developer SDK

For an app that already handles controllers, the complete integration is:

```js
import { claimControllerSupport } from '@simonstoryparker/padkit';
const release = claimControllerSupport();
// Keep your existing controller implementation. Call release() when it unmounts.
```

This declaration does not poll, remap, or intercept input. TypeScript declarations are included at both package entrypoints. See `examples/existing-app.html` for a runnable integration retaining the browser Gamepad API, and `examples/integration.ts` for typed examples of both paths.


Import from `packages/sdk/index.js`, or install this private repository as a Git dependency. The package exports the SDK at its root and normalization helpers at `/core`. The SDK uses browser globals only when initialized.

```js
import { createController } from '@simonstoryparker/padkit';
const controller = createController({
  bindings: { confirm: 0, pause: 9 },
  onAction({ action, phase }) { console.log(action, phase); },
  onFrame(pads) { /* normalized analog and digital states */ },
  calibration: {
    'your device id': { threshold: 0.12, axes: [0, 1, 2, 3], buttons: [0, 1, 2, 3] }
  }
});
// Call on component unmount:
controller.dispose();
```

The SDK shares one polling loop per window. Repeated initialization with the same callback references and equivalent options shares a subscription; each returned handle has independent, idempotent cleanup. Different callbacks subscribe independently. Keep callbacks stable if initializing repeatedly. Action mappings are optional: without `bindings`, only input frames are delivered. `pads[i].raw` exposes the original browser Gamepad. Disconnect, loss of focus, hidden pages and disposal release active actions immediately. Page restoration resumes polling automatically. Nonstandard input mapping is opt-in; configure the full button/axis index list when remapping.

An app that already owns its input loop can call `claimControllerSupport()` and retain its returned cleanup function. Use `{ source: 'native' }` only when the app supplies its own native controller reader. Normal SDK ownership suppresses extension navigation while preserving the optional bridge as an input source; native ownership suppresses the bridge too. Reference-counted claims handle overlapping component lifetimes. The DOM marker is a cooperation mechanism, not a security boundary or detector for unrelated third-party controller libraries.

## SDK and handoff test

From this repository:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/examples/sdk.html`. Enable that exact origin with the CLI to test simultaneous extension/SDK use. The extension popup should report **Handled by this app**. Pressing **Release SDK ownership** hands navigation back to the extension when using its navigation preset.

## Verification

```sh
npm test
sh native/build.sh
python3 native/tests/test-native.py
```

Automated checks cover action edges/disconnect, calibration, SDK claim lifecycle, duplicate subscriptions, focus/visibility/page lifecycle, profile-scoped setup/update/removal, permission URL validation, virtual gamepad coexistence, malformed frames and native message framing/origin rejection. Physical controller behavior and browser installation need a manual test. 
