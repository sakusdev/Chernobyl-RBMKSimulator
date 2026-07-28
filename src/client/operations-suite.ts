type ScenarioId = "cold-start" | "rated" | "low-flow" | "turbine-trip" | "xenon-recovery";

type SavedPanelState = {
  controls: Record<string, string>;
  pumps: number;
  feedPumps: number;
  breakerClosed: boolean;
  savedAt: string;
};

const scenarioDefinitions: Record<ScenarioId, {
  title: string;
  description: string;
  controls: Record<string, number>;
  pumps: number;
  feedPumps: number;
  breaker: boolean;
}> = {
  "cold-start": {
    title: "冷態起動準備",
    description: "制御棒全挿入、循環2台、給水1台、タービン隔離状態",
    controls: { "rod-control": 100, "flow-control": 35, "feedwater-control": 35, "level-control": 50, "bypass-control": 0, "valve-control": 0 },
    pumps: 2,
    feedPumps: 1,
    breaker: false,
  },
  rated: {
    title: "定格運転近傍",
    description: "8台循環、3台給水、タービン・発電機系を定格近傍へ設定",
    controls: { "rod-control": 42, "flow-control": 100, "feedwater-control": 92, "level-control": 50, "bypass-control": 0, "valve-control": 86 },
    pumps: 8,
    feedPumps: 3,
    breaker: true,
  },
  "low-flow": {
    title: "主循環流量低下",
    description: "出力運転中に主循環ポンプを減らし、ボイド反応を観察",
    controls: { "rod-control": 48, "flow-control": 28, "feedwater-control": 72, "level-control": 50, "bypass-control": 0, "valve-control": 72 },
    pumps: 2,
    feedPumps: 2,
    breaker: true,
  },
  "turbine-trip": {
    title: "タービントリップ",
    description: "発電機遮断器を開放し、タービン停止とバイパス開を模擬",
    controls: { "rod-control": 60, "flow-control": 88, "feedwater-control": 75, "level-control": 52, "bypass-control": 75, "valve-control": 0 },
    pumps: 6,
    feedPumps: 2,
    breaker: false,
  },
  "xenon-recovery": {
    title: "低出力キセノン回復",
    description: "低出力・高挿入状態から慎重に反応度余裕を確認",
    controls: { "rod-control": 68, "flow-control": 62, "feedwater-control": 48, "level-control": 50, "bypass-control": 5, "valve-control": 22 },
    pumps: 4,
    feedPumps: 2,
    breaker: false,
  },
};

const procedures = [
  {
    id: "startup",
    title: "起動前確認",
    steps: ["主循環ポンプ運転台数を確認", "給水ポンプと気水分離器水位を確認", "発電機遮断器が開放状態であることを確認", "制御棒を段階的に引き抜く", "炉周期が短くなり過ぎていないことを確認"],
  },
  {
    id: "sync",
    title: "発電機併入",
    steps: ["タービン回転数を3000 rpm近傍へ合わせる", "発電機電圧を確認", "周波数差を0.25 Hz以内へ合わせる", "発電機遮断器を投入", "電気出力と蒸気圧力の安定を確認"],
  },
  {
    id: "trip",
    title: "異常時停止",
    steps: ["タービントリップまたはAZ-5を判断", "発電機遮断器の開放を確認", "主循環流量を維持", "気水分離器水位と圧力を監視", "警報を確認し操作記録を保存"],
  },
] as const;

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function dispatchRange(id: string, value: number): void {
  const input = byId<HTMLInputElement>(id);
  if (!input) return;
  input.value = String(value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function setPumpCount(selector: string, count: number): void {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>(selector)];
  const current = buttons.filter((button) => button.classList.contains("running")).length;
  if (current === count) return;
  const target = buttons[Math.max(0, Math.min(buttons.length - 1, count === 0 ? 0 : count - 1))];
  if (!target) return;
  if (count === 0 && current > 0) {
    buttons[0]?.click();
  } else {
    target.click();
  }
}

function setBreaker(closed: boolean): void {
  const button = byId<HTMLButtonElement>("breaker-button");
  if (!button) return;
  const current = button.classList.contains("closed");
  if (current !== closed) button.click();
}

function appendOperatorEvent(message: string): void {
  const log = byId<HTMLElement>("event-log");
  if (!log) return;
  const row = document.createElement("p");
  row.className = "suite-event";
  row.innerHTML = `<time>操作</time>${message}`;
  log.prepend(row);
}

function applyScenario(id: ScenarioId): void {
  const scenario = scenarioDefinitions[id];
  for (const [controlId, value] of Object.entries(scenario.controls)) dispatchRange(controlId, value);
  setPumpCount("[data-pump]", scenario.pumps);
  setPumpCount("[data-fwp]", scenario.feedPumps);
  setBreaker(scenario.breaker);
  appendOperatorEvent(`シナリオ「${scenario.title}」を設定`);
  updateScenarioStatus(scenario.title);
}

function updateScenarioStatus(text: string): void {
  const output = byId<HTMLElement>("suite-scenario-status");
  if (output) output.textContent = text;
}

function collectState(): SavedPanelState {
  const ids = ["rod-control", "flow-control", "feedwater-control", "level-control", "bypass-control", "valve-control"];
  const controls: Record<string, string> = {};
  for (const id of ids) {
    const input = byId<HTMLInputElement>(id);
    if (input) controls[id] = input.value;
  }
  return {
    controls,
    pumps: document.querySelectorAll("[data-pump].running").length,
    feedPumps: document.querySelectorAll("[data-fwp].running").length,
    breakerClosed: byId("breaker-button")?.classList.contains("closed") ?? false,
    savedAt: new Date().toISOString(),
  };
}

function saveState(): void {
  localStorage.setItem("rbmk-panel-state", JSON.stringify(collectState()));
  appendOperatorEvent("操作盤状態をブラウザへ保存");
}

function loadState(): void {
  const raw = localStorage.getItem("rbmk-panel-state");
  if (!raw) {
    appendOperatorEvent("保存済み操作盤状態なし");
    return;
  }
  try {
    const state = JSON.parse(raw) as SavedPanelState;
    for (const [id, value] of Object.entries(state.controls)) dispatchRange(id, Number(value));
    setPumpCount("[data-pump]", state.pumps);
    setPumpCount("[data-fwp]", state.feedPumps);
    setBreaker(state.breakerClosed);
    appendOperatorEvent(`操作盤状態を復元（${new Date(state.savedAt).toLocaleString("ja-JP")}）`);
  } catch {
    appendOperatorEvent("保存状態の読み込みに失敗");
  }
}

function acknowledgeAlarms(): void {
  document.querySelectorAll<HTMLElement>(".annunciator.active").forEach((node) => node.classList.add("acknowledged"));
  appendOperatorEvent("現在の警報を確認済みに設定");
}

function resetAcknowledgement(): void {
  document.querySelectorAll<HTMLElement>(".annunciator.acknowledged").forEach((node) => node.classList.remove("acknowledged"));
}

function bindRodBanks(): void {
  const bankInputs = [...document.querySelectorAll<HTMLInputElement>("[data-rod-bank]")];
  const master = byId<HTMLInputElement>("rod-control");
  if (!master || !bankInputs.length) return;

  const syncMaster = (): void => {
    const average = bankInputs.reduce((sum, input) => sum + Number(input.value), 0) / bankInputs.length;
    dispatchRange("rod-control", average);
    const output = byId<HTMLElement>("suite-bank-average");
    if (output) output.textContent = `${average.toFixed(1)}%`;
  };

  bankInputs.forEach((input) => input.addEventListener("input", syncMaster));
  master.addEventListener("input", () => {
    const value = master.value;
    bankInputs.forEach((input) => { input.value = value; });
    const output = byId<HTMLElement>("suite-bank-average");
    if (output) output.textContent = `${Number(value).toFixed(1)}%`;
  });
}

function renderProcedure(id: string): void {
  const procedure = procedures.find((item) => item.id === id) ?? procedures[0];
  const container = byId<HTMLElement>("suite-procedure-steps");
  if (!container) return;
  container.innerHTML = procedure.steps.map((step, index) => `
    <label class="procedure-step"><input type="checkbox"><span>${index + 1}</span><b>${step}</b></label>
  `).join("");
}

function installSuite(): void {
  if (!document.querySelector(".bshch-shell") || byId("operations-suite")) return;
  const suite = document.createElement("aside");
  suite.id = "operations-suite";
  suite.className = "operations-suite collapsed";
  suite.innerHTML = `
    <button id="suite-toggle" class="suite-toggle" aria-expanded="false">運転支援盤</button>
    <div class="suite-body">
      <header><strong>運転支援・訓練盤</strong><small id="suite-scenario-status">手動運転</small></header>
      <section>
        <h3>シナリオ設定</h3>
        <div class="scenario-grid">${Object.entries(scenarioDefinitions).map(([id, item]) => `<button data-scenario="${id}" title="${item.description}">${item.title}</button>`).join("")}</div>
      </section>
      <section>
        <h3>制御棒バンク <output id="suite-bank-average">100.0%</output></h3>
        <div class="rod-bank-grid">
          ${["A 左前", "B 右前", "C 左後", "D 右後"].map((name, index) => `<label><span>${name}</span><input data-rod-bank="${index}" type="range" min="0" max="100" step="0.5" value="100"><output>100%</output></label>`).join("")}
        </div>
        <small>4バンク値の平均を一括制御棒指令へ反映します。</small>
      </section>
      <section>
        <h3>運転手順</h3>
        <select id="suite-procedure-select">${procedures.map((item) => `<option value="${item.id}">${item.title}</option>`).join("")}</select>
        <div id="suite-procedure-steps"></div>
      </section>
      <section class="suite-actions">
        <button id="suite-ack">警報確認</button>
        <button id="suite-save">状態保存</button>
        <button id="suite-load">状態復元</button>
        <button id="suite-clear-checks">手順リセット</button>
      </section>
    </div>
  `;
  document.body.append(suite);

  byId("suite-toggle")?.addEventListener("click", () => {
    const collapsed = suite.classList.toggle("collapsed");
    byId("suite-toggle")?.setAttribute("aria-expanded", String(!collapsed));
  });
  suite.querySelectorAll<HTMLButtonElement>("[data-scenario]").forEach((button) => button.addEventListener("click", () => applyScenario(button.dataset.scenario as ScenarioId)));
  byId("suite-ack")?.addEventListener("click", acknowledgeAlarms);
  byId("suite-save")?.addEventListener("click", saveState);
  byId("suite-load")?.addEventListener("click", loadState);
  byId("suite-clear-checks")?.addEventListener("click", () => suite.querySelectorAll<HTMLInputElement>(".procedure-step input").forEach((input) => { input.checked = false; }));
  byId<HTMLSelectElement>("suite-procedure-select")?.addEventListener("change", (event) => renderProcedure((event.currentTarget as HTMLSelectElement).value));
  suite.querySelectorAll<HTMLInputElement>("[data-rod-bank]").forEach((input) => input.addEventListener("input", () => {
    const output = input.parentElement?.querySelector("output");
    if (output) output.textContent = `${Number(input.value).toFixed(0)}%`;
  }));
  bindRodBanks();
  renderProcedure("startup");

  const observer = new MutationObserver(() => {
    document.querySelectorAll<HTMLElement>(".annunciator:not(.active).acknowledged").forEach((node) => node.classList.remove("acknowledged"));
  });
  const annunciatorGrid = byId("annunciator-grid");
  if (annunciatorGrid) observer.observe(annunciatorGrid, { subtree: true, attributes: true, attributeFilter: ["class"] });

  byId("reset-button")?.addEventListener("click", resetAcknowledgement);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => queueMicrotask(installSuite));
} else {
  queueMicrotask(installSuite);
}
