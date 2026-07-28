import type { ControlInput, ReactorSnapshot } from "./types";

export type SimulationCommand =
  | { type: "initialize"; fixedStepSeconds?: number; publishIntervalMs?: number }
  | { type: "controls"; controls: Partial<ControlInput> }
  | { type: "pause"; paused: boolean }
  | { type: "speed"; multiplier: number }
  | { type: "reset" }
  | { type: "request-snapshot" };

export type SimulationEvent =
  | { type: "ready"; backend: "typescript" | "wasm"; fixedStepSeconds: number }
  | { type: "speed"; multiplier: number }
  | { type: "snapshot"; snapshot: ReactorSnapshot; sequence: number }
  | { type: "error"; message: string };

export interface SimulationBackend {
  readonly name: "typescript" | "wasm";
  setControls(controls: Partial<ControlInput>): void;
  reset(): void;
  step(dt: number): ReactorSnapshot;
  getSnapshot(): ReactorSnapshot;
}
