export interface Calibration { threshold?: number; buttons?: number[]; axes?: number[]; }
export interface ControllerState {
  /** Original browser object, including native buttons, mapping and optional haptics. */
  raw: Gamepad;
  id: string;
  index: number;
  standard: boolean;
  axes: number[];
  buttons: number[];
  vibration: boolean;
}
export interface ActionEvent { action: string; phase: 'press' | 'release'; }
export function deadzone(value: number, threshold?: number): number;
export function normalize(pad: Gamepad | null | undefined, calibration?: Calibration): ControllerState | null;
export function createActions(bindings?: Record<string, number>): (pads: readonly (ControllerState | null)[]) => ActionEvent[];
