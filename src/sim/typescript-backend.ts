import { ReactorSimulation } from "./reactor";
import type { SimulationBackend } from "./protocol";
import type { ControlInput, ReactorSnapshot } from "./types";

export class TypeScriptSimulationBackend implements SimulationBackend {
  public readonly name = "typescript" as const;
  private readonly simulation = new ReactorSimulation();

  public setControls(controls: Partial<ControlInput>): void {
    this.simulation.setControls(controls);
  }

  public reset(): void {
    this.simulation.reset();
  }

  public step(dt: number): ReactorSnapshot {
    return this.simulation.step(dt);
  }

  public getSnapshot(): ReactorSnapshot {
    return this.simulation.getSnapshot();
  }
}
