# Developer SDK & Integration

The `@simonstoryparker/padkit` package provides JavaScript and TypeScript APIs to interact with controllers in web apps and games. It includes:

- **Ownership declarations** (`claimControllerSupport`): Cooperates with the Padkit extension to yield extension navigation or native bridge emulation.
- **Unified polling runtime** (`createController`): Provides a shared, reference-counted controller polling loop with deadzone normalization and action edge triggers.
- **Low-level normalization primitives** (`@simonstoryparker/padkit/core`): Pure helper functions for deadzone calculation, Gamepad normalization, and button binding state machines.

---

## Installation

Install the package directly from GitHub:

```sh
npm install github:simonstoryparker/padkit#v0.5.0
```

Node 20+ is required for build tooling, but the compiled SDK has zero external dependencies and runs in any modern browser.

TypeScript type declarations are exported from the package root and `./core`.

---

## Integration Patterns

### Pattern 1: Existing Controller Implementation

If your application already polls `navigator.getGamepads()` or uses its own gamepad management loop, you do not need to replace your input code. Simply claim controller ownership:

```typescript
import { claimControllerSupport } from '@simonstoryparker/padkit';

// In your top-level component mount (e.g., useEffect, onMounted, or init):
const release = claimControllerSupport();

// When the component unmounts:
release();
```

#### How it works
- `claimControllerSupport()` marks the document with `data-padkit-owner="gamepad"`.
- The Padkit browser extension checks this attribute. If set, the extension yields navigation mode (preventing stick/button inputs from scrolling or navigating the webpage).
- The native bridge continues to feed raw controller data into `navigator.getGamepads()`.
- If your application handles native controller inputs directly through a custom binary or local service, call `claimControllerSupport({ source: 'native' })`. This tells Padkit to suspend the USB bridge as well.
- Calls to `claimControllerSupport()` are reference-counted. Multiple components can claim ownership concurrently; ownership is only released once all cleanup callbacks have been executed.

---

### Pattern 2: Managed Controller Subscription

If your application does not have a controller loop, use `createController` to receive normalized frame updates and action events:

```typescript
import { createController, type ControllerState, type ActionEvent } from '@simonstoryparker/padkit';

const controller = createController({
  // Action bindings map button indices to descriptive action names
  bindings: {
    confirm: 0, // A button
    cancel: 1,  // B button
    pause: 9,   // Menu / Start button
  },

  // Called on press ('press') and release ('release') transitions
  onAction(event: ActionEvent) {
    console.log(`Action ${event.action}: ${event.phase}`);
  },

  // Called on each animation frame with normalized controller states
  onFrame(pads: ControllerState[]) {
    for (const pad of pads) {
      const [leftX, leftY, rightX, rightY] = pad.axes;
      // Axes have calibrated deadzones applied (default 0.15)
    }
  },

  // Optional custom calibration per controller ID
  calibration: {
    'PowerA FUSION Pro 2 (local USB adapter)': {
      threshold: 0.12,
      axes: [0, 1, 2, 3],
      buttons: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    },
  },
});

// Tear down when leaving the page or component unmounts:
controller.dispose();
```

#### Shared Polling Loop
- A single `requestAnimationFrame` loop is shared per window across all `createController()` callers.
- Identical callback references and configurations share the same underlying subscription.
- Polling automatically suspends on `pagehide`, window `blur`, or when the document becomes hidden (`visibilitychange`), and resumes on `pageshow` and focus. Active actions are cleanly released on suspension or disconnect.

---

### Pattern 3: Pure Normalization Utilities

For custom game loops that handle their own `requestAnimationFrame` tick, import utilities directly from `@simonstoryparker/padkit/core`:

```typescript
import { deadzone, normalize, createActions } from '@simonstoryparker/padkit/core';

// 1. Deadzone filtering with linear endpoint rescaling
const axis = deadzone(rawAxisValue, 0.12);

// 2. Normalize a browser Gamepad object into a clean ControllerState
const pad = navigator.getGamepads()[0];
const state = normalize(pad, {
  threshold: 0.15,
  axes: [0, 1, 2, 3],
  buttons: [0, 1, 2, 3],
});

// 3. Stateful action transition detector
const getActionEvents = createActions({ jump: 0, fire: 7 });
const events = getActionEvents([state]);
```

---

## API Reference

### Module `@simonstoryparker/padkit`

#### `claimControllerSupport(options?): () => void`

Declares controller ownership to the Padkit extension without polling input.

- **Parameters**:
  - `options.source` (`'gamepad' | 'native'`, default: `'gamepad'`):
    - `'gamepad'`: Suppresses extension navigation preset while keeping the PowerA bridge active.
    - `'native'`: Suppresses both extension navigation and the native PowerA bridge.
- **Returns**: A cleanup function `() => void`. Calling it decrements the reference count and clears the DOM marker when claims reach zero.

#### `createController(options?): Controller`

Subscribes to normalized controller updates on `requestAnimationFrame`. Automatically claims controller support for its lifetime.

- **Parameters**: `ControllerOptions`
  - `onFrame?(pads: ControllerState[]): void`: Invoked on each animation frame with active controllers.
  - `onAction?(event: ActionEvent): void`: Invoked when bound buttons transition to pressed or released.
  - `bindings?`: Record mapping action string to button index number (e.g. `{ confirm: 0 }`).
  - `calibration?`: Map of gamepad `id` strings to `Calibration` configurations.
- **Returns**: `Controller` object with:
  - `dispose(): void`: Unsubscribes from updates. Safe to call multiple times.

---

### Module `@simonstoryparker/padkit/core`

#### `deadzone(value: number, threshold?: number): number`

Clamps noise within `[-threshold, threshold]` to `0`, and rescales the remaining range linearly to `[-1, 1]`.

- `threshold`: Number between `0` and `0.95` (default: `0.15`).

#### `normalize(pad: Gamepad | null | undefined, calibration?: Calibration): ControllerState | null`

Transforms a standard browser `Gamepad` instance into a sanitized `ControllerState`. Returns `null` if the gamepad is missing or disconnected.

- `calibration.threshold`: Deadzone threshold (default: `0.15`).
- `calibration.axes`: Optional subset or reordering of axis indices.
- `calibration.buttons`: Optional subset or reordering of button indices.

#### `createActions(bindings?: Record<string, number>): (pads: readonly (ControllerState | null)[]) => ActionEvent[]`

Creates a stateful edge detector function that inspects controller states and produces `press` and `release` events.

- Default bindings: `{ confirm: 0, back: 1, up: 12, down: 13, left: 14, right: 15 }`.

---

### Type Definitions

```typescript
export interface ControllerState {
  raw: Gamepad;          // Original browser Gamepad reference
  id: string;            // Device identifier string
  index: number;         // Gamepad slot index
  standard: boolean;     // Whether browser reports mapping === 'standard'
  axes: number[];        // Normalized float values [-1.0, 1.0] with deadzone applied
  buttons: number[];     // Normalized float values [0.0, 1.0]
  vibration: boolean;    // Whether a vibration actuator is present
}

export interface ActionEvent {
  action: string;
  phase: 'press' | 'release';
}

export interface Calibration {
  threshold?: number;
  axes?: number[];
  buttons?: number[];
}
```

---

## Testing & Local Verification

### Running the SDK Examples

> [!NOTE]
> Ensure you have completed initial setup and loaded the Padkit extension into your browser profile before running this verification test (see [Installation & Setup](installation.md#loading-the-extension-into-chromium)).

Serve the repository locally:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

1. Add `http://127.0.0.1:8765` using the CLI:
   ```sh
   padkit add http://127.0.0.1:8765 --browser chrome --profile Default
   ```
2. Open `http://127.0.0.1:8765/examples/sdk.html`.
3. Open the Padkit extension popup in the browser toolbar. It should display **Handled by this app**.
4. Click **Release SDK ownership** on the page. The popup will update to indicate navigation mode has resumed.
5. Open `http://127.0.0.1:8765/examples/existing-app.html` to verify direct `navigator.getGamepads()` integration with `claimControllerSupport()`.

### Running Automated Tests

Run the full JavaScript and native test suite:

```sh
npm test
```

This runs:
- `tests/*.test.js`: Core normalization, action state transitions, CLI argument parsing, browser discovery, manifest bundling, and SDK reference-count / lifecycle handling.
- `native/tests/test-gamepad.cjs`: Virtual gamepad coexistence, duplicate loading prevention, axis and button boundary checks.

To test native daemon compilation and Unix socket communication:

```sh
sh native/build.sh
python3 native/tests/test-native.py
```

> [!TIP]
> To run tests in isolation without touching your user's `~/Library/Application Support/Padkit` directory, set the `PADKIT_HOME` environment variable:
> ```sh
> PADKIT_HOME=$(mktemp -d) npm test
> ```
