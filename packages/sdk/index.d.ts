import type { ActionEvent, Calibration, ControllerState } from '../core/index.js';
export type { ActionEvent, Calibration, ControllerState } from '../core/index.js';
export interface ControllerOptions {
  onFrame?: (pads: ControllerState[]) => void;
  /** Only emits actions when bindings are supplied. */
  onAction?: (event: ActionEvent) => void;
  bindings?: Record<string, number>;
  calibration?: Record<string, Calibration>;
}
export interface Controller { /** Idempotent cleanup of this subscription. */ dispose(): void; }
/** One shared poller; identical callbacks/options share a reference-counted subscription. */
export function createController(options?: ControllerOptions): Controller;
/** Declare existing input ownership without changing how the app reads controllers. */
export function claimControllerSupport(options?: { source?: 'gamepad' | 'native' }): () => void;
