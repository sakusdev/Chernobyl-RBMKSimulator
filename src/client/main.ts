import "./styles.css";
import { ReactorSimulation } from "../sim/reactor";
import type { ReactorSnapshot, TrendPoint } from "../sim/types";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Application root not found");

app.innerHTML = `
  <main class="console-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">CHORNOBYL NPP · UNIT CONTROL</p>
        <h1>RBMK-1000 Plant Dynamics Simulator</h1>
      </div>
      <div class="topbar-actions">
        <span id="mode-pill" class="mode-pill">SHUTDOWN</span>
        <button id="pause-button" class="button">PAUSE</button>
        <button id="reset-button" class="button button-muted">RESET</button>
      </div>
    </header>

    <section class="metrics" id="metrics"></section>

    <section class="workspace">
      <aside class="panel controls-panel">
        <div class="panel-heading">
          <div><span>01</span><h2>Reactor Controls</h2></div>
          <small>MANUAL</small>
        </div>
        <label class="control-row">
          <span>Control rod insertion</span>
          <output id="rod-output">100.0%</output>
          <input id="rod-control" type="range" min="0" max="100" value="100" step="0.5" />
        </label>
        <label class="control-row">
          <span>Main circulation flow</span>
          <output id="flow-output">35.0%</output>
          <input id="flow-control" type="range" min="10" max="110" value="35" step="0.5" />
        </label>
        <label class="control-row">
          <span>Turbine control valve</span>
          <output id="valve-output">0.0%</output>
          <input id="valve-control" type="range" min="0" max="100" value="0" step="0.5" />
        </label>
        <button id="az5-button" class="az5-button"><span>AZ-5</span><small>EMERGENCY PROTECTION</small></button>
        <div class="procedure">
          <h3>Startup reference</h3>
          <ol>
            <li>Maintain circulation above 35%.</li>
            <li>Withdraw rods gradually below 64%.</li>
            <li>Open turbine valve after stable steam production.</li>
          </ol>
        </div>
      </aside>

      <section class="panel core-panel">
        <div class="panel-heading">
          <div><span>02</span><h2>Core Overview</h2></div>
          <small>SIMPLIFIED MODEL</small>
        </div>
        <div class="core-layout">
          <div class="core-map" id="core-map" aria-label="Simplified reactor core heat map"></div>
          <div class="reactivity-stack">
            <div><span>Reactivity</span><strong id="reactivity-value">0 pcm</strong></div>
            <div><span>Void fraction</span><strong id="void-value">0.0%</strong></div>
            <div><span>Xenon-135</span><strong id="xenon-value">0.0%</strong></div>
            <div><span>Reactor period</span><strong id="period-value">∞ s</strong></div>
          </div>
        </div>
        <canvas id="trend-canvas" width="960" height="260"></canvas>
      </section>

      <aside class="panel alarm-panel">
        <div class="panel-heading">
          <div><span>03</span><h2>Alarm Annunciator</h2></div>
          <small id="alarm-count">0 ACTIVE</small>
        </div>
        <div id="alarm-list" class="alarm-list"></div>
        <div class="event-log">
          <h3>Event log</h3>
          <div id="event-log"></div>
        </div>
      </aside>
    </section>

    <footer>
      <span>EDUCATIONAL MODEL · NOT FOR ENGINEERING OR OPERATOR TRAINING</span>
      <span id="sim-time">T+00:00:00</span>
    </footer>
  </main>
`;

const sim = new ReactorSimulation();
let paused = false;
let accumulator = 0;
let previousFrame = performance.now();
const fixedStep = 0.05;
const trends: TrendPoint[] = [];
const eventEntries: string[] = ["Simulation initialized"];
let lastAlarmIds = new Set<string>();

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
};

const rodControl = byId<HTMLInputElement>("rod-control");
const flowControl = byId<HTMLInputElement>("flow-control");
const valveControl = byId<HTMLInputElement>("valve-control");

function bindControl(input: HTMLInputElement, outputId: string, key: "rodTarget" | "coolantFlowTarget" | "turbineValveTarget"): void {
  const output = byId<HTMLOutputElement>(outputId);
  input.addEventListener("input", () => {
    const value = Number(input.value);
    output.value = `${value.toFixed(1)}%`;
    sim.setControls({ [key]: value });
  });
}

bindControl(rodControl, "rod-output", "rodTarget");
bindControl(flowControl, "flow-output", "coolantFlowTarget");
bindControl(valveControl, "valve-output", "turbineValveTarget");

byId<HTMLButtonElement>("az5-button").addEventListener("click", () => {
  sim.setControls({ az5: true, rodTarget: 100 });
  rodControl.value = "100";
  byId<HTMLOutputElement>("rod-output").value = "100.0%";
  eventEntries.unshift("AZ-5 emergency protection activated");
});

byId<HTMLButtonElement>("pause-button").addEventListener("click", (event) => {
  paused = !paused;
  (event.currentTarget as HTMLButtonElement).textContent = paused ? "RESUME" : "PAUSE";
  eventEntries.unshift(paused ? "Simulation paused" : "Simulation resumed");
});

byId<HTMLButtonElement>("reset-button").addEventListener("click", () => {
  sim.reset();
  rodControl.value = "100";
  flowControl.value = "35";
  valveControl.value = "0";
  byId<HTMLOutputElement>("rod-output").value = "100.0%";
  byId<HTMLOutputElement>("flow-output").value = "35.0%";
  byId<HTMLOutputElement>("valve-output").value = "0.0%";
  trends.length = 0;
  eventEntries.unshift("Plant state reset");
});

function render(snapshot: ReactorSnapshot): void {
  const metrics = [
    ["THERMAL POWER", snapshot.thermalPowerMW, "MWt", 0],
    ["ELECTRIC OUTPUT", snapshot.electricPowerMW, "MWe", 0],
    ["STEAM PRESSURE", snapshot.steamPressureMPa, "MPa", 2],
    ["COOLANT FLOW", snapshot.coolantFlowPercent, "%", 1],
    ["FUEL TEMPERATURE", snapshot.fuelTemperatureC, "°C", 0],
    ["TURBINE SPEED", snapshot.turbineRpm, "rpm", 0],
  ] as const;

  byId("metrics").innerHTML = metrics.map(([label, value, unit, digits]) => `
    <article class="metric-card">
      <span>${label}</span>
      <strong>${value.toFixed(digits)}</strong>
      <small>${unit}</small>
    </article>
  `).join("");

  const pill = byId("mode-pill");
  pill.textContent = snapshot.mode.toUpperCase();
  pill.className = `mode-pill mode-${snapshot.mode}`;
  byId("reactivity-value").textContent = `${snapshot.reactivityPcm >= 0 ? "+" : ""}${snapshot.reactivityPcm.toFixed(0)} pcm`;
  byId("void-value").textContent = `${snapshot.voidFractionPercent.toFixed(1)}%`;
  byId("xenon-value").textContent = `${snapshot.xenonPercent.toFixed(1)}%`;
  byId("period-value").textContent = Math.abs(snapshot.periodSeconds) > 900 ? "∞ s" : `${snapshot.periodSeconds.toFixed(1)} s`;
  byId("sim-time").textContent = `T+${formatTime(snapshot.time)}`;

  renderCore(snapshot);
  renderAlarms(snapshot);
  renderTrend();
}

function renderCore(snapshot: ReactorSnapshot): void {
  const map = byId("core-map");
  if (!map.children.length) {
    for (let y = 0; y < 15; y += 1) {
      for (let x = 0; x < 15; x += 1) {
        const radius = Math.hypot(x - 7, y - 7);
        const cell = document.createElement("span");
        cell.className = radius > 7.1 ? "core-cell core-cell-empty" : "core-cell";
        cell.dataset.x = String(x);
        cell.dataset.y = String(y);
        map.append(cell);
      }
    }
  }

  const power = Math.min(snapshot.neutronPowerPercent / 100, 1.4);
  [...map.children].forEach((child) => {
    const cell = child as HTMLElement;
    if (cell.classList.contains("core-cell-empty")) return;
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    const radial = Math.max(0, 1 - Math.hypot(x - 7, y - 7) / 8);
    const modulation = 0.84 + Math.sin(x * 1.8 + y * 0.7) * 0.08;
    const level = Math.max(0.02, power * radial * modulation);
    cell.style.setProperty("--level", String(level));
  });
}

function renderAlarms(snapshot: ReactorSnapshot): void {
  const active = snapshot.alarms.filter((alarm) => alarm.active);
  const currentIds = new Set(active.map((alarm) => alarm.id));
  for (const alarm of active) {
    if (!lastAlarmIds.has(alarm.id)) eventEntries.unshift(`${alarm.severity.toUpperCase()}: ${alarm.message}`);
  }
  lastAlarmIds = currentIds;

  byId("alarm-count").textContent = `${active.length} ACTIVE`;
  byId("alarm-list").innerHTML = snapshot.alarms.map((alarm) => `
    <div class="alarm ${alarm.active ? `alarm-active alarm-${alarm.severity}` : ""}">
      <span class="alarm-indicator"></span>
      <strong>${alarm.message}</strong>
    </div>
  `).join("");

  byId("event-log").innerHTML = eventEntries.slice(0, 8).map((entry, index) => `
    <p><time>${index === 0 ? "NOW" : `-${index}`}</time>${entry}</p>
  `).join("");
}

function renderTrend(): void {
  const canvas = byId<HTMLCanvasElement>("trend-canvas");
  const context = canvas.getContext("2d");
  if (!context) return;
  const dpr = Math.max(1, window.devicePixelRatio);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  context.strokeStyle = "rgba(128, 190, 159, 0.12)";
  context.lineWidth = 1;
  for (let i = 1; i < 5; i += 1) {
    const y = (height / 5) * i;
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
  }
  drawLine(context, trends.map((point) => point.power / 120), width, height, "#75f0af");
  drawLine(context, trends.map((point) => point.pressure / 8), width, height, "#f0c96d");
  drawLine(context, trends.map((point) => point.temperature / 900), width, height, "#ef816c");
}

function drawLine(context: CanvasRenderingContext2D, values: number[], width: number, height: number, color: string): void {
  if (values.length < 2) return;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.beginPath();
  values.forEach((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width;
    const y = height - Math.min(Math.max(value, 0), 1.2) * height * 0.82 - 12;
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  });
  context.stroke();
}

function formatTime(seconds: number): string {
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((total % 3600) / 60).toString().padStart(2, "0");
  const secs = (total % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${secs}`;
}

let trendTimer = 0;
function frame(now: number): void {
  const realDt = Math.min((now - previousFrame) / 1000, 0.25);
  previousFrame = now;
  if (!paused) {
    accumulator += realDt;
    trendTimer += realDt;
    while (accumulator >= fixedStep) {
      sim.step(fixedStep);
      accumulator -= fixedStep;
    }
    if (trendTimer >= 0.25) {
      const snapshot = sim.getSnapshot();
      trends.push({
        time: snapshot.time,
        power: snapshot.neutronPowerPercent,
        pressure: snapshot.steamPressureMPa,
        temperature: snapshot.fuelTemperatureC,
      });
      if (trends.length > 240) trends.shift();
      trendTimer = 0;
    }
  }
  render(sim.getSnapshot());
  requestAnimationFrame(frame);
}

render(sim.getSnapshot());
requestAnimationFrame(frame);
