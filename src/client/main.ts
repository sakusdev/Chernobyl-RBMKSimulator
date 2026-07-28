import "./styles.css";
import { SimulationClient } from "./simulation-client";
import type { CoreField, ReactorSnapshot, TrendPoint } from "../sim/types";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Application root not found");

app.innerHTML = `
  <main class="console-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">CHORNOBYL NPP · UNIT CONTROL</p>
        <h1>RBMK-1000 Plant Dynamics Simulator</h1>
        <small id="runtime-status">STARTING SIMULATION CORE…</small>
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
        <div class="panel-heading"><div><span>01</span><h2>Reactor Controls</h2></div><small>MANUAL</small></div>
        <label class="control-row"><span>Control rod insertion</span><output id="rod-output">100.0%</output><input id="rod-control" type="range" min="0" max="100" value="100" step="0.5" /></label>
        <label class="control-row"><span>Main circulation flow</span><output id="flow-output">35.0%</output><input id="flow-control" type="range" min="10" max="110" value="35" step="0.5" /></label>
        <label class="control-row"><span>Feedwater flow</span><output id="feedwater-output">35.0%</output><input id="feedwater-control" type="range" min="0" max="110" value="35" step="0.5" /></label>
        <label class="control-row"><span>Turbine control valve</span><output id="valve-output">0.0%</output><input id="valve-control" type="range" min="0" max="100" value="0" step="0.5" /></label>
        <button id="az5-button" class="az5-button"><span>AZ-5</span><small>EMERGENCY PROTECTION</small></button>
        <div class="procedure"><h3>Startup reference</h3><ol><li>Maintain circulation above 35%.</li><li>Withdraw rods gradually below 64%.</li><li>Open the turbine valve only after stable steam production.</li></ol></div>
      </aside>

      <section class="panel core-panel">
        <div class="panel-heading">
          <div><span>02</span><h2>Core Overview</h2></div>
          <label><small>FIELD</small><select id="core-field"><option value="power">POWER</option><option value="fuelTemperature">FUEL TEMP</option><option value="voidFraction">VOID</option><option value="xenon">XENON</option><option value="rodInsertion">RODS</option></select></label>
        </div>
        <div class="core-layout">
          <div class="core-map" id="core-map" aria-label="Spatial reactor core heat map"></div>
          <div class="reactivity-stack">
            <div><span>Total reactivity</span><strong id="reactivity-value">0 pcm</strong></div>
            <div><span>Rod worth</span><strong id="rod-reactivity">0 pcm</strong></div>
            <div><span>Void feedback</span><strong id="void-reactivity">0 pcm</strong></div>
            <div><span>Fuel feedback</span><strong id="fuel-reactivity">0 pcm</strong></div>
            <div><span>Xenon feedback</span><strong id="xenon-reactivity">0 pcm</strong></div>
            <div><span>Reactor period</span><strong id="period-value">∞ s</strong></div>
          </div>
        </div>
        <canvas id="trend-canvas" width="960" height="260"></canvas>
      </section>

      <aside class="panel alarm-panel">
        <div class="panel-heading"><div><span>03</span><h2>Alarm Annunciator</h2></div><small id="alarm-count">0 ACTIVE</small></div>
        <div id="alarm-list" class="alarm-list"></div>
        <div class="event-log"><h3>Event log</h3><div id="event-log"></div></div>
      </aside>
    </section>

    <footer><span>EDUCATIONAL MODEL · NOT FOR ENGINEERING OR OPERATOR TRAINING</span><span id="sim-time">T+00:00:00</span></footer>
  </main>
`;

const client = new SimulationClient();
const trends: TrendPoint[] = [];
const events: string[] = ["Simulation worker starting"];
let paused = false;
let selectedField: CoreField = "power";
let lastSnapshot: ReactorSnapshot | undefined;
let lastTrendTime = -1;
let lastAlarmIds = new Set<string>();

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
};

const controls = {
  rod: byId<HTMLInputElement>("rod-control"),
  flow: byId<HTMLInputElement>("flow-control"),
  feedwater: byId<HTMLInputElement>("feedwater-control"),
  valve: byId<HTMLInputElement>("valve-control"),
};

function bindControl(input: HTMLInputElement, outputId: string, key: "rodTarget" | "coolantFlowTarget" | "feedwaterTarget" | "turbineValveTarget"): void {
  input.addEventListener("input", () => {
    const value = Number(input.value);
    byId<HTMLOutputElement>(outputId).value = `${value.toFixed(1)}%`;
    client.setControls({ [key]: value });
  });
}

bindControl(controls.rod, "rod-output", "rodTarget");
bindControl(controls.flow, "flow-output", "coolantFlowTarget");
bindControl(controls.feedwater, "feedwater-output", "feedwaterTarget");
bindControl(controls.valve, "valve-output", "turbineValveTarget");

byId<HTMLSelectElement>("core-field").addEventListener("change", (event) => {
  selectedField = (event.currentTarget as HTMLSelectElement).value as CoreField;
  if (lastSnapshot) renderCore(lastSnapshot);
});

byId<HTMLButtonElement>("az5-button").addEventListener("click", () => {
  client.setControls({ az5: true, rodTarget: 100 });
  controls.rod.value = "100";
  byId<HTMLOutputElement>("rod-output").value = "100.0%";
  events.unshift("AZ-5 emergency protection activated");
});

byId<HTMLButtonElement>("pause-button").addEventListener("click", (event) => {
  paused = !paused;
  client.setPaused(paused);
  (event.currentTarget as HTMLButtonElement).textContent = paused ? "RESUME" : "PAUSE";
  events.unshift(paused ? "Simulation paused" : "Simulation resumed");
});

byId<HTMLButtonElement>("reset-button").addEventListener("click", () => {
  client.reset();
  Object.assign(controls.rod, { value: "100" });
  Object.assign(controls.flow, { value: "35" });
  Object.assign(controls.feedwater, { value: "35" });
  Object.assign(controls.valve, { value: "0" });
  byId<HTMLOutputElement>("rod-output").value = "100.0%";
  byId<HTMLOutputElement>("flow-output").value = "35.0%";
  byId<HTMLOutputElement>("feedwater-output").value = "35.0%";
  byId<HTMLOutputElement>("valve-output").value = "0.0%";
  trends.length = 0;
  lastTrendTime = -1;
  events.unshift("Plant state reset");
});

client.onStatus((message) => {
  byId("runtime-status").textContent = message;
  events.unshift(message);
});

client.onSnapshot((snapshot) => {
  lastSnapshot = snapshot;
  if (snapshot.time - lastTrendTime >= 0.25 || lastTrendTime < 0) {
    trends.push({ time: snapshot.time, power: snapshot.neutronPowerPercent, pressure: snapshot.steamPressureMPa, temperature: snapshot.fuelTemperatureC });
    if (trends.length > 360) trends.shift();
    lastTrendTime = snapshot.time;
  }
  render(snapshot);
});

function render(snapshot: ReactorSnapshot): void {
  const metrics = [
    ["THERMAL POWER", snapshot.thermalPowerMW, "MWt", 0], ["ELECTRIC OUTPUT", snapshot.electricPowerMW, "MWe", 0],
    ["STEAM PRESSURE", snapshot.steamPressureMPa, "MPa", 2], ["STEAM FLOW", snapshot.steamFlowKgS, "kg/s", 0],
    ["FUEL TEMPERATURE", snapshot.fuelTemperatureC, "°C", 0], ["TURBINE SPEED", snapshot.turbineRpm, "rpm", 0],
  ] as const;
  byId("metrics").innerHTML = metrics.map(([label, value, unit, digits]) => `<article class="metric-card"><span>${label}</span><strong>${value.toFixed(digits)}</strong><small>${unit}</small></article>`).join("");

  const pill = byId("mode-pill");
  pill.textContent = snapshot.mode.toUpperCase();
  pill.className = `mode-pill mode-${snapshot.mode}`;
  setPcm("reactivity-value", snapshot.reactivity.total);
  setPcm("rod-reactivity", snapshot.reactivity.rods);
  setPcm("void-reactivity", snapshot.reactivity.voids);
  setPcm("fuel-reactivity", snapshot.reactivity.fuelTemperature);
  setPcm("xenon-reactivity", snapshot.reactivity.xenon);
  byId("period-value").textContent = Math.abs(snapshot.periodSeconds) > 900 ? "∞ s" : `${snapshot.periodSeconds.toFixed(1)} s`;
  byId("sim-time").textContent = `T+${formatTime(snapshot.time)}`;
  renderCore(snapshot);
  renderAlarms(snapshot);
  renderTrend();
}

function renderCore(snapshot: ReactorSnapshot): void {
  const map = byId("core-map");
  if (map.children.length !== snapshot.coreCells.length) {
    map.innerHTML = "";
    map.style.gridTemplateColumns = `repeat(${snapshot.coreWidth}, 1fr)`;
    for (const coreCell of snapshot.coreCells) {
      const cell = document.createElement("span");
      cell.className = coreCell.active ? "core-cell" : "core-cell core-cell-empty";
      cell.title = `Channel ${coreCell.x + 1}-${coreCell.y + 1}`;
      map.append(cell);
    }
  }

  snapshot.coreCells.forEach((data, index) => {
    const cell = map.children[index] as HTMLElement | undefined;
    if (!cell || !data.active) return;
    const { level, value } = fieldValue(data, selectedField);
    cell.style.setProperty("--level", level.toFixed(4));
    cell.dataset.value = value;
    cell.title = `Channel ${data.x + 1}-${data.y + 1} · ${value}`;
  });
}

function fieldValue(cell: ReactorSnapshot["coreCells"][number], field: CoreField): { level: number; value: string } {
  switch (field) {
    case "power": return { level: Math.min(cell.power / 1.25, 1.4), value: `${(cell.power * 100).toFixed(1)}% local power` };
    case "fuelTemperature": return { level: Math.min(Math.max((cell.fuelTemperature - 250) / 650, 0.02), 1.4), value: `${cell.fuelTemperature.toFixed(0)} °C` };
    case "voidFraction": return { level: Math.min(cell.voidFraction / 70, 1.4), value: `${cell.voidFraction.toFixed(1)}% void` };
    case "xenon": return { level: Math.min(cell.xenon / 60, 1.4), value: `${cell.xenon.toFixed(1)}% Xe-135` };
    case "rodInsertion": return { level: Math.min((100 - cell.rodInsertion) / 75, 1.4), value: `${cell.rodInsertion.toFixed(1)}% inserted` };
  }
}

function renderAlarms(snapshot: ReactorSnapshot): void {
  const active = snapshot.alarms.filter((alarm) => alarm.active);
  const ids = new Set(active.map((alarm) => alarm.id));
  for (const alarm of active) if (!lastAlarmIds.has(alarm.id)) events.unshift(`${alarm.severity.toUpperCase()}: ${alarm.message}`);
  lastAlarmIds = ids;
  byId("alarm-count").textContent = `${active.length} ACTIVE`;
  byId("alarm-list").innerHTML = snapshot.alarms.map((alarm) => `<div class="alarm ${alarm.active ? `alarm-active alarm-${alarm.severity}` : ""}"><span class="alarm-indicator"></span><strong>${alarm.message}</strong></div>`).join("");
  byId("event-log").innerHTML = events.slice(0, 10).map((entry, index) => `<p><time>${index === 0 ? "NOW" : `-${index}`}</time>${entry}</p>`).join("");
}

function renderTrend(): void {
  const canvas = byId<HTMLCanvasElement>("trend-canvas");
  const context = canvas.getContext("2d");
  if (!context) return;
  const dpr = Math.max(1, window.devicePixelRatio);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) { canvas.width = width * dpr; canvas.height = height * dpr; }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  context.strokeStyle = "rgba(128, 190, 159, 0.12)";
  for (let i = 1; i < 5; i += 1) { const y = height / 5 * i; context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
  drawLine(context, trends.map((p) => p.power / 120), width, height, "#75f0af");
  drawLine(context, trends.map((p) => p.pressure / 8), width, height, "#f0c96d");
  drawLine(context, trends.map((p) => p.temperature / 900), width, height, "#ef816c");
}

function drawLine(context: CanvasRenderingContext2D, values: number[], width: number, height: number, color: string): void {
  if (values.length < 2) return;
  context.strokeStyle = color; context.lineWidth = 2; context.beginPath();
  values.forEach((value, index) => { const x = index / Math.max(values.length - 1, 1) * width; const y = height - Math.min(Math.max(value, 0), 1.2) * height * 0.82 - 12; index === 0 ? context.moveTo(x, y) : context.lineTo(x, y); });
  context.stroke();
}

function setPcm(id: string, value: number): void { byId(id).textContent = `${value >= 0 ? "+" : ""}${value.toFixed(0)} pcm`; }
function formatTime(seconds: number): string { const total = Math.floor(seconds); return `${Math.floor(total / 3600).toString().padStart(2, "0")}:${Math.floor(total % 3600 / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`; }
window.addEventListener("beforeunload", () => client.dispose());
