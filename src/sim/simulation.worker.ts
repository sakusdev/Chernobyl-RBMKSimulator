/// <reference lib="webworker" />

import type { SimulationCommand, SimulationEvent } from "./protocol";
import { TypeScriptSimulationBackend } from "./typescript-backend";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const backend = new TypeScriptSimulationBackend();

let fixedStepSeconds = 0.05;
let publishIntervalMs = 100;
let speedMultiplier = 1;
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
    accumulatorSeconds += elapsedSeconds * speedMultiplier;
    let steps = 0;
    while (accumulatorSeconds >= fixedStepSeconds && steps < 250) {
      backend.step(fixedStepSeconds);
      accumulatorSeconds -= fixedStepSeconds;
      steps += 1;
    }
    if (steps === 250) accumulatorSeconds = 0;
  }

  if (nowMs - lastPublishMs >= publishIntervalMs) {
    publishSnapshot();
    lastPublishMs = nowMs;
  }

  scope.setTimeout(() => tick(performance.now()), 8);
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
      case "speed":
        speedMultiplier = Math.min(Math.max(command.multiplier, 0.25), 32);
        post({ type: "speed", multiplier: speedMultiplier });
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
