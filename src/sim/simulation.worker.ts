/// <reference lib="webworker" />

import type { SimulationCommand, SimulationEvent } from "./protocol";
import { TypeScriptSimulationBackend } from "./typescript-backend";

const scope = self as DedicatedWorkerGlobalScope;
const backend = new TypeScriptSimulationBackend();

let fixedStepSeconds = 0.05;
let publishIntervalMs = 100;
let paused = false;
let sequence = 0;
let accumulatorSeconds = 0;
let previousTimeMs = performance.now();
let lastPublishMs = previousTimeMs;

const post = (event: SimulationEvent): void => scope.postMessage(event);

function publishSnapshot(): void {
  post({ type: "snapshot", snapshot: backend.getSnapshot(), sequence });
  sequence += 1;
}

function tick(nowMs: number): void {
  const elapsedSeconds = Math.min((nowMs - previousTimeMs) / 1000, 0.25);
  previousTimeMs = nowMs;

  if (!paused) {
    accumulatorSeconds += elapsedSeconds;
    while (accumulatorSeconds >= fixedStepSeconds) {
      backend.step(fixedStepSeconds);
      accumulatorSeconds -= fixedStepSeconds;
    }
  }

  if (nowMs - lastPublishMs >= publishIntervalMs) {
    publishSnapshot();
    lastPublishMs = nowMs;
  }

  setTimeout(() => tick(performance.now()), 8);
}

scope.addEventListener("message", (event: MessageEvent<SimulationCommand>) => {
  try {
    const command = event.data;
    switch (command.type) {
      case "initialize":
        fixedStepSeconds = Math.min(Math.max(command.fixedStepSeconds ?? 0.05, 0.005), 0.1);
        publishIntervalMs = Math.min(Math.max(command.publishIntervalMs ?? 100, 16), 1000);
        post({ type: "ready", backend: backend.name, fixedStepSeconds });
        publishSnapshot();
        break;
      case "controls":
        backend.setControls(command.controls);
        break;
      case "pause":
        paused = command.paused;
        break;
      case "reset":
        backend.reset();
        accumulatorSeconds = 0;
        publishSnapshot();
        break;
      case "request-snapshot":
        publishSnapshot();
        break;
      default: {
        const exhaustive: never = command;
        throw new Error(`Unsupported command: ${JSON.stringify(exhaustive)}`);
      }
    }
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
});

post({ type: "ready", backend: backend.name, fixedStepSeconds });
tick(performance.now());

export {};
