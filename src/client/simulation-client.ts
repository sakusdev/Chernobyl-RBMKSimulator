import type { SimulationCommand, SimulationEvent } from "../sim/protocol";
import type { ControlInput, ReactorSnapshot } from "../sim/types";

export class SimulationClient {
  private readonly worker: Worker;
  private snapshotListeners = new Set<(snapshot: ReactorSnapshot) => void>();
  private statusListeners = new Set<(message: string) => void>();

  constructor(): void {
    this.worker = new Worker(new URL("../sim/simulation.worker.ts", import.meta.url), { type: "module" });
    this.worker.addEventListener("message", (event: MessageEvent<SimulationEvent>) => {
      switch (event.data.type) {
        case "snapshot":
          for (const listener of this.snapshotListeners) listener(event.data.snapshot);
          break;
        case "ready":
          for (const listener of this.statusListeners) listener(`${event.data.backend.toUpperCase()} CORE READY · Δt ${event.data.fixedStepSeconds.toFixed(3)} s`);
          break;
        case "error":
          for (const listener of this.statusListeners) listener(`SIMULATION ERROR · ${event.data.message}`);
          break;
      }
    });
    this.send({ type: "initialize", fixedStepSeconds: 0.05, publishIntervalMs: 100 });
  }

  public onSnapshot(listener: (snapshot: ReactorSnapshot) => void): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  public onStatus(listener: (message: string) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  public setControls(controls: Partial<ControlInput>): void {
    this.send({ type: "controls", controls });
  }

  public setPaused(paused: boolean): void {
    this.send({ type: "pause", paused });
  }

  public reset(): void {
    this.send({ type: "reset" });
  }

  public dispose(): void {
    this.worker.terminate();
    this.snapshotListeners.clear();
    this.statusListeners.clear();
  }

  private send(command: SimulationCommand): void {
    this.worker.postMessage(command);
  }
}
