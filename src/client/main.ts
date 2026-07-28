import "./authentic-control-room.css";
import { SimulationClient } from "./simulation-client";
import type { CoreField, ReactorSnapshot, TrendPoint } from "../sim/types";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Application root not found");

const annunciators = [
  "МОЩНОСТЬ РЕАКТОРА ВЫСОКА", "МАЛЫЙ ПЕРИОД РЕАКТОРА", "ДАВЛЕНИЕ БС ВЫСОКО", "РАСХОД ГЦК НИЗКИЙ",
  "УРОВЕНЬ БС НИЗКИЙ", "УРОВЕНЬ БС ВЫСОКИЙ", "ТЕМПЕРАТУРА ТОПЛИВА", "ПАРОСОДЕРЖАНИЕ",
  "РАЗГОН ТУРБИНЫ", "ВАКУУМ КОНДЕНСАТОРА", "ГЕНЕРАТОР НЕ СИНХР.", "АЗ-5 ВВЕДЕНА",
];

app.innerHTML = `
  <main class="bshch-shell">
    <header class="room-header">
      <div class="station-id">
        <strong>ЧЕРНОБЫЛЬСКАЯ АЭС · БЛОК 3</strong>
        <span>БЛОЧНЫЙ ЩИТ УПРАВЛЕНИЯ РБМК-1000</span>
      </div>
      <div class="clock-bank">
        <div><span>ВРЕМЯ</span><b id="wall-clock">00:00:00</b></div>
        <div><span>РЕЖИМ</span><b id="mode-indicator">ОСТАНОВ</b></div>
        <div><span>ЯДРО</span><b id="runtime-status">ЗАПУСК…</b></div>
      </div>
      <div class="master-actions">
        <button id="pause-button" class="metal-button">ПАУЗА</button>
        <button id="reset-button" class="metal-button">СБРОС</button>
      </div>
    </header>

    <section class="rear-wall">
      <section class="wall-panel annunciator-wall">
        <div class="panel-caption">АВАРИЙНАЯ СИГНАЛИЗАЦИЯ</div>
        <div id="annunciator-grid" class="annunciator-grid">
          ${annunciators.map((text, index) => `<div class="annunciator" data-annunciator="${index}">${text}</div>`).join("")}
        </div>
      </section>

      <section class="wall-panel reactor-wall">
        <div class="panel-caption">
          <span>ФИЗИЧЕСКИЙ КОНТРОЛЬ РЕАКТОРА</span>
          <select id="core-field" class="soviet-select">
            <option value="power">МОЩНОСТЬ</option>
            <option value="fuelTemperature">ТЕМП. ТОПЛИВА</option>
            <option value="voidFraction">ПАРОСОДЕРЖАНИЕ</option>
            <option value="xenon">КСЕНОН-135</option>
            <option value="rodInsertion">ПОГРУЖЕНИЕ СУЗ</option>
          </select>
        </div>
        <div class="reactor-board">
          <div id="core-map" class="core-map-authentic" aria-label="Карта энерговыделения активной зоны"></div>
          <div class="vertical-meters">
            <div class="bar-meter"><span>МОЩН.</span><i id="power-bar"></i><b id="power-value">0.0%</b></div>
            <div class="bar-meter"><span>ПЕРИОД</span><i id="period-bar"></i><b id="period-value">∞</b></div>
            <div class="bar-meter"><span>РЕАКТ.</span><i id="reactivity-bar"></i><b id="reactivity-value">0</b></div>
          </div>
        </div>
      </section>

      <section class="wall-panel mimic-wall">
        <div class="panel-caption">ТЕПЛОВАЯ СХЕМА БЛОКА</div>
        <svg class="mimic" viewBox="0 0 720 310" role="img" aria-label="Упрощенная тепловая схема РБМК">
          <g class="pipe primary">
            <path d="M75 155 H155 V65 H305" />
            <path d="M75 155 H155 V245 H305" />
            <path d="M305 65 H420 V120" />
            <path d="M305 245 H420 V190" />
          </g>
          <g class="pipe steam"><path d="M420 120 H530 V85 H650" /></g>
          <g class="pipe feed"><path d="M650 225 H530 V190 H420" /></g>
          <rect x="30" y="110" width="90" height="90" class="mimic-device" />
          <text x="75" y="145">РЕАКТОР</text><text x="75" y="166">РБМК</text>
          <circle cx="235" cy="65" r="25" class="mimic-device" /><text x="235" y="70">ГЦН-А</text>
          <circle cx="235" cy="245" r="25" class="mimic-device" /><text x="235" y="250">ГЦН-Б</text>
          <rect x="385" y="105" width="70" height="100" rx="35" class="mimic-device" />
          <text x="420" y="145">БС</text><text x="420" y="165">1/2</text>
          <path d="M535 65 L590 85 L535 105 Z" class="mimic-device" /><text x="565" y="55">ТГ-7</text>
          <circle cx="650" cy="85" r="28" class="mimic-device" /><text x="650" y="90">Г</text>
          <rect x="610" y="195" width="80" height="60" class="mimic-device" /><text x="650" y="230">КОНД.</text>
          <g id="mimic-status"></g>
        </svg>
        <div class="mimic-values">
          <span>БС <b id="separator-level">50.0%</b></span>
          <span>ДАВЛ. <b id="steam-pressure">2.10 МПа</b></span>
          <span>ПАР <b id="steam-flow">0 кг/с</b></span>
          <span>ВАКУУМ <b id="vacuum-value">72 кПа</b></span>
        </div>
      </section>
    </section>

    <section class="operator-desks">
      <section class="desk siur-desk">
        <div class="desk-label"><b>СИУР</b><span>СТАРШИЙ ИНЖЕНЕР УПРАВЛЕНИЯ РЕАКТОРОМ</span></div>
        <div class="instrument-row">
          <div class="round-gauge" data-min="0" data-max="120"><span>МОЩНОСТЬ<br>% Nном</span><i id="gauge-power"></i><b id="gauge-power-readout">0.0</b></div>
          <div class="round-gauge"><span>ТЕПЛОВАЯ<br>МВт</span><i id="gauge-thermal"></i><b id="gauge-thermal-readout">0</b></div>
          <div class="round-gauge"><span>ПЕРИОД<br>сек</span><i id="gauge-period"></i><b id="gauge-period-readout">∞</b></div>
        </div>
        <div class="control-strip">
          <label>СУЗ ОБЩАЯ<input id="rod-control" type="range" min="0" max="100" value="100" step="0.5"><output id="rod-output">100.0%</output></label>
          <label>ПОЛЕ КСЕНОНА<output id="xenon-output">18.0%</output></label>
          <label>ПАРОСОДЕРЖ.<output id="void-output">0.0%</output></label>
        </div>
        <div class="az-cluster">
          <button id="az1-button" class="protection-button yellow">АЗ-1</button>
          <button id="az2-button" class="protection-button yellow">АЗ-2</button>
          <button id="az5-button" class="az5-button-auth"><span>АЗ-5</span><small>АВАРИЙНАЯ ЗАЩИТА</small></button>
        </div>
      </section>

      <section class="desk siub-desk">
        <div class="desk-label"><b>СИУБ</b><span>СТАРШИЙ ИНЖЕНЕР УПРАВЛЕНИЯ БЛОКОМ</span></div>
        <div class="pump-board">
          <div><span>ГЦН</span><div id="mcp-buttons" class="lamp-buttons">${Array.from({length:8},(_,i)=>`<button data-pump="${i+1}"><i></i>${i+1}</button>`).join("")}</div></div>
          <div><span>ПЭН</span><div id="fwp-buttons" class="lamp-buttons">${Array.from({length:3},(_,i)=>`<button data-fwp="${i+1}"><i></i>${i+1}</button>`).join("")}</div></div>
        </div>
        <div class="control-strip two-column">
          <label>РАСХОД ГЦК<input id="flow-control" type="range" min="10" max="110" value="35" step="0.5"><output id="flow-output">35.0%</output></label>
          <label>ПИТАТ. ВОДА<input id="feedwater-control" type="range" min="0" max="110" value="35" step="0.5"><output id="feedwater-output">35.0%</output></label>
          <label>УРОВЕНЬ БС<input id="level-control" type="range" min="20" max="80" value="50" step="0.5"><output id="level-output">50.0%</output></label>
          <label>БАЙПАС БРОУ-К<input id="bypass-control" type="range" min="0" max="100" value="0" step="1"><output id="bypass-output">0%</output></label>
        </div>
      </section>

      <section class="desk siut-desk">
        <div class="desk-label"><b>СИУТ</b><span>СТАРШИЙ ИНЖЕНЕР УПРАВЛЕНИЯ ТУРБИНОЙ</span></div>
        <div class="instrument-row">
          <div class="round-gauge"><span>ОБОРОТЫ<br>об/мин</span><i id="gauge-rpm"></i><b id="rpm-readout">0</b></div>
          <div class="round-gauge"><span>МОЩНОСТЬ<br>МВт</span><i id="gauge-electric"></i><b id="electric-readout">0</b></div>
          <div class="round-gauge"><span>ЧАСТОТА<br>Гц</span><i id="gauge-frequency"></i><b id="frequency-readout">0.00</b></div>
        </div>
        <div class="control-strip">
          <label>РЕГУЛИР. КЛАПАН<input id="valve-control" type="range" min="0" max="100" value="0" step="0.5"><output id="valve-output">0.0%</output></label>
          <label>НАПРЯЖЕНИЕ<output id="voltage-output">0.0 кВ</output></label>
        </div>
        <div class="switch-cluster">
          <button id="breaker-button" class="knife-switch"><i></i><span>ВЫКЛЮЧАТЕЛЬ<br>ГЕНЕРАТОРА</span></button>
          <button id="trip-button" class="trip-button">СТОП ТУРБИНЫ</button>
        </div>
      </section>
    </section>

    <section class="lower-strip">
      <div class="trend-panel"><canvas id="trend-canvas"></canvas></div>
      <div class="reactivity-ledger">
        <span>СУЗ <b id="rho-rods">0</b></span><span>ПАР <b id="rho-void">0</b></span><span>ТЕМП. <b id="rho-temp">0</b></span><span>Xe <b id="rho-xe">0</b></span><span>Σρ <b id="rho-total">0</b></span>
      </div>
      <div class="event-tape"><div id="event-log"></div></div>
    </section>
  </main>
`;

const client = new SimulationClient();
const trends: TrendPoint[] = [];
const events: string[] = ["БЩУ: запуск вычислительного ядра"];
let selectedField: CoreField = "power";
let lastSnapshot: ReactorSnapshot | undefined;
let lastTrendTime = -1;
let paused = false;
let pumps = 2;
let feedPumps = 1;
let breakerClosed = false;

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
};

function bindRange(id: string, outputId: string, key: "rodTarget" | "coolantFlowTarget" | "feedwaterTarget" | "separatorLevelTarget" | "bypassValveTarget" | "turbineValveTarget"): void {
  const input = byId<HTMLInputElement>(id);
  input.addEventListener("input", () => {
    const value = Number(input.value);
    byId<HTMLOutputElement>(outputId).value = `${value.toFixed(key === "bypassValveTarget" ? 0 : 1)}%`;
    client.setControls({ [key]: value });
  });
}

bindRange("rod-control", "rod-output", "rodTarget");
bindRange("flow-control", "flow-output", "coolantFlowTarget");
bindRange("feedwater-control", "feedwater-output", "feedwaterTarget");
bindRange("level-control", "level-output", "separatorLevelTarget");
bindRange("bypass-control", "bypass-output", "bypassValveTarget");
bindRange("valve-control", "valve-output", "turbineValveTarget");

byId<HTMLSelectElement>("core-field").addEventListener("change", (event) => {
  selectedField = (event.currentTarget as HTMLSelectElement).value as CoreField;
  if (lastSnapshot) renderCore(lastSnapshot);
});

byId("mcp-buttons").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-pump]");
  if (!button) return;
  const n = Number(button.dataset.pump);
  pumps = n <= pumps ? n - 1 : n;
  pumps = Math.max(0, Math.min(8, pumps));
  client.setControls({ mainCirculationPumps: pumps });
  events.unshift(`ГЦН: в работе ${pumps}`);
  updatePumpButtons();
});

byId("fwp-buttons").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-fwp]");
  if (!button) return;
  const n = Number(button.dataset.fwp);
  feedPumps = n <= feedPumps ? n - 1 : n;
  feedPumps = Math.max(0, Math.min(3, feedPumps));
  client.setControls({ feedwaterPumps: feedPumps });
  events.unshift(`ПЭН: в работе ${feedPumps}`);
  updatePumpButtons();
});

function updatePumpButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-pump]").forEach((button) => button.classList.toggle("running", Number(button.dataset.pump) <= pumps));
  document.querySelectorAll<HTMLButtonElement>("[data-fwp]").forEach((button) => button.classList.toggle("running", Number(button.dataset.fwp) <= feedPumps));
}
updatePumpButtons();

byId("az1-button").addEventListener("click", () => { client.setControls({ rodTarget: Math.min(100, Number(byId<HTMLInputElement>("rod-control").value) + 10) }); events.unshift("АЗ-1: снижение мощности"); });
byId("az2-button").addEventListener("click", () => { client.setControls({ rodTarget: Math.min(100, Number(byId<HTMLInputElement>("rod-control").value) + 25) }); events.unshift("АЗ-2: ускоренное снижение мощности"); });
byId("az5-button").addEventListener("click", () => { client.setControls({ az5: true, rodTarget: 100 }); byId<HTMLInputElement>("rod-control").value = "100"; byId<HTMLOutputElement>("rod-output").value = "100.0%"; events.unshift("АЗ-5: аварийная защита введена"); });
byId("trip-button").addEventListener("click", () => { client.setControls({ turbineTrip: true }); breakerClosed = false; events.unshift("ТУРБИНА: стопорные клапаны закрыты"); });
byId("breaker-button").addEventListener("click", () => { breakerClosed = !breakerClosed; client.setControls({ generatorBreakerClosed: breakerClosed, turbineTrip: false }); byId("breaker-button").classList.toggle("closed", breakerClosed); events.unshift(`ГЕНЕРАТОР: выключатель ${breakerClosed ? "включен" : "отключен"}`); });
byId("pause-button").addEventListener("click", () => { paused = !paused; client.setPaused(paused); byId("pause-button").textContent = paused ? "ПУСК" : "ПАУЗА"; });
byId("reset-button").addEventListener("click", () => { client.reset(); trends.length = 0; events.unshift("БЛОК: состояние сброшено"); });

client.onStatus((status) => { byId("runtime-status").textContent = status; });
client.onSnapshot((snapshot) => {
  lastSnapshot = snapshot;
  if (lastTrendTime < 0 || snapshot.time - lastTrendTime >= 0.25) {
    trends.push({ time: snapshot.time, power: snapshot.neutronPowerPercent, pressure: snapshot.steamPressureMPa, temperature: snapshot.fuelTemperatureC });
    if (trends.length > 360) trends.shift();
    lastTrendTime = snapshot.time;
  }
  render(snapshot);
});

function setGauge(id: string, value: number, min: number, max: number): void {
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  byId(id).style.transform = `rotate(${-132 + normalized * 264}deg)`;
}

function render(snapshot: ReactorSnapshot): void {
  const modeLabels = { shutdown: "ОСТАНОВ", startup: "ПУСК", power: "МОЩНОСТЬ", scram: "АЗ-5" } as const;
  byId("mode-indicator").textContent = modeLabels[snapshot.mode];
  byId("wall-clock").textContent = formatTime(snapshot.time);
  byId("power-value").textContent = `${snapshot.neutronPowerPercent.toFixed(1)}%`;
  byId("period-value").textContent = Math.abs(snapshot.periodSeconds) > 900 ? "∞" : snapshot.periodSeconds.toFixed(1);
  byId("reactivity-value").textContent = `${snapshot.reactivityPcm.toFixed(0)} pcm`;
  byId("power-bar").style.height = `${Math.min(100, snapshot.neutronPowerPercent)}%`;
  byId("period-bar").style.height = `${Math.min(100, Math.max(0, 100 - Math.abs(snapshot.periodSeconds)))}%`;
  byId("reactivity-bar").style.height = `${Math.min(100, Math.max(0, 50 + snapshot.reactivityPcm / 20))}%`;

  setGauge("gauge-power", snapshot.neutronPowerPercent, 0, 120);
  setGauge("gauge-thermal", snapshot.thermalPowerMW, 0, 3400);
  setGauge("gauge-period", Math.min(100, Math.abs(snapshot.periodSeconds)), 0, 100);
  setGauge("gauge-rpm", snapshot.turbineRpm, 0, 3300);
  setGauge("gauge-electric", snapshot.electricPowerMW, 0, 1100);
  setGauge("gauge-frequency", snapshot.systems.gridFrequencyHz, 0, 52.5);

  byId("gauge-power-readout").textContent = snapshot.neutronPowerPercent.toFixed(1);
  byId("gauge-thermal-readout").textContent = snapshot.thermalPowerMW.toFixed(0);
  byId("gauge-period-readout").textContent = Math.abs(snapshot.periodSeconds) > 900 ? "∞" : snapshot.periodSeconds.toFixed(1);
  byId("rpm-readout").textContent = snapshot.turbineRpm.toFixed(0);
  byId("electric-readout").textContent = snapshot.electricPowerMW.toFixed(0);
  byId("frequency-readout").textContent = snapshot.systems.gridFrequencyHz.toFixed(2);
  byId("voltage-output").textContent = `${snapshot.systems.generatorVoltageKV.toFixed(1)} кВ`;
  byId("xenon-output").textContent = `${snapshot.xenonPercent.toFixed(1)}%`;
  byId("void-output").textContent = `${snapshot.voidFractionPercent.toFixed(1)}%`;
  byId("separator-level").textContent = `${snapshot.systems.separatorLevelPercent.toFixed(1)}%`;
  byId("steam-pressure").textContent = `${snapshot.steamPressureMPa.toFixed(2)} МПа`;
  byId("steam-flow").textContent = `${snapshot.steamFlowKgS.toFixed(0)} кг/с`;
  byId("vacuum-value").textContent = `${snapshot.systems.condenserVacuumKPa.toFixed(0)} кПа`;

  byId("rho-rods").textContent = snapshot.reactivity.rods.toFixed(0);
  byId("rho-void").textContent = snapshot.reactivity.voids.toFixed(0);
  byId("rho-temp").textContent = snapshot.reactivity.fuelTemperature.toFixed(0);
  byId("rho-xe").textContent = snapshot.reactivity.xenon.toFixed(0);
  byId("rho-total").textContent = snapshot.reactivity.total.toFixed(0);

  renderCore(snapshot);
  renderAlarms(snapshot);
  renderTrend();
  byId("event-log").innerHTML = events.slice(0, 10).map((entry, index) => `<p><time>${index === 0 ? "СЕЙЧАС" : `-${index}`}</time>${entry}</p>`).join("");
}

function renderCore(snapshot: ReactorSnapshot): void {
  const map = byId("core-map");
  if (map.children.length !== snapshot.coreCells.length) {
    map.innerHTML = "";
    map.style.gridTemplateColumns = `repeat(${snapshot.coreWidth}, 1fr)`;
    snapshot.coreCells.forEach((cell) => {
      const node = document.createElement("span");
      node.className = cell.active ? "core-channel" : "core-channel inactive";
      map.append(node);
    });
  }
  const ranges: Record<CoreField, [number, number]> = { power: [0, 140], fuelTemperature: [250, 900], voidFraction: [0, 85], xenon: [0, 100], rodInsertion: [0, 100] };
  const [min, max] = ranges[selectedField];
  snapshot.coreCells.forEach((cell, index) => {
    const node = map.children[index] as HTMLElement;
    if (!cell.active) return;
    const value = cell[selectedField];
    const level = Math.max(0, Math.min(1, (value - min) / (max - min)));
    node.style.setProperty("--level", String(level));
    node.title = `${cell.x + 1}-${cell.y + 1} · ${selectedField}: ${value.toFixed(1)}`;
  });
}

function renderAlarms(snapshot: ReactorSnapshot): void {
  const activeMessages = new Set(snapshot.alarms.filter((alarm) => alarm.active).map((alarm) => alarm.message));
  document.querySelectorAll<HTMLElement>(".annunciator").forEach((node) => {
    const active = activeMessages.has(node.textContent?.trim() ?? "");
    node.classList.toggle("active", active);
    node.classList.toggle("critical", snapshot.alarms.some((alarm) => alarm.active && alarm.message === node.textContent?.trim() && alarm.severity === "critical"));
  });
  for (const alarm of snapshot.alarms) {
    if (alarm.active && !events[0]?.includes(alarm.message)) events.unshift(`СИГНАЛ: ${alarm.message}`);
  }
}

function renderTrend(): void {
  const canvas = byId<HTMLCanvasElement>("trend-canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.max(1, devicePixelRatio);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) { canvas.width = width * dpr; canvas.height = height * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(35,55,40,.35)";
  for (let i = 1; i < 6; i += 1) { ctx.beginPath(); ctx.moveTo(0, height * i / 6); ctx.lineTo(width, height * i / 6); ctx.stroke(); }
  drawTrace(ctx, trends.map((p) => p.power / 120), width, height, "#183d22");
  drawTrace(ctx, trends.map((p) => p.pressure / 8), width, height, "#7b301e");
  drawTrace(ctx, trends.map((p) => p.temperature / 900), width, height, "#755b16");
}

function drawTrace(ctx: CanvasRenderingContext2D, values: number[], width: number, height: number, color: string): void {
  if (values.length < 2) return;
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
  values.forEach((value, index) => { const x = index / (values.length - 1) * width; const y = height - Math.max(0, Math.min(1, value)) * height; index ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();
}

function formatTime(seconds: number): string {
  const total = Math.floor(seconds);
  return [Math.floor(total / 3600), Math.floor(total % 3600 / 60), total % 60].map((n) => String(n).padStart(2, "0")).join(":");
}
