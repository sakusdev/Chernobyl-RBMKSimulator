import type { ControlInput, ReactorSnapshot, RodBankTuple } from "../sim/types";
import { RBMK_SET_CONTROLS_EVENT, RBMK_SNAPSHOT_EVENT } from "./simulation-client";

type BankMode = "synchronised" | "independent";

let mode: BankMode = "synchronised";
let inputs: HTMLInputElement[] = [];
let lastSnapshot: ReactorSnapshot | null = null;

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function readTargets(): RodBankTuple {
  return [0, 1, 2, 3].map((index) => Number(inputs[index]?.value ?? 100)) as RodBankTuple;
}

function dispatchControls(controls: Partial<ControlInput>): void {
  window.dispatchEvent(new CustomEvent<Partial<ControlInput>>(RBMK_SET_CONTROLS_EVENT, { detail: controls }));
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function updateInputReadouts(): void {
  inputs.forEach((input, index) => {
    const output = input.closest("label")?.querySelector<HTMLOutputElement>("output");
    if (output) output.value = `${Number(input.value).toFixed(1)}%`;
    const actual = byId<HTMLElement>(`rod-bank-actual-${index}`);
    if (actual && !lastSnapshot) actual.textContent = "実位置 --";
  });
  const targets = readTargets();
  const targetAverage = average(targets);
  const existingAverage = byId<HTMLElement>("suite-bank-average");
  if (existingAverage) existingAverage.textContent = `${targetAverage.toFixed(1)}%`;
  const targetOutput = byId<HTMLElement>("rod-bank-target-average");
  if (targetOutput) targetOutput.textContent = `${targetAverage.toFixed(1)}%`;
}

function commitTargets(): void {
  const targets = readTargets();
  dispatchControls({ rodBankTargets: targets, rodTarget: average(targets) });
  updateInputReadouts();
}

function setMode(nextMode: BankMode): void {
  mode = nextMode;
  const master = byId<HTMLInputElement>("rod-control");
  if (master) master.disabled = mode === "independent";
  inputs.forEach((input) => { input.disabled = mode === "synchronised"; });
  document.querySelectorAll<HTMLButtonElement>("[data-bank-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.bankMode === mode);
    button.setAttribute("aria-pressed", String(button.dataset.bankMode === mode));
  });
  const description = byId<HTMLElement>("rod-bank-mode-description");
  if (description) {
    description.textContent = mode === "synchronised"
      ? "一括制御棒指令で4バンクを同時操作"
      : "各象限のバンクを独立操作・局所出力分布へ反映";
  }
  if (mode === "synchronised" && master) {
    const value = Number(master.value);
    inputs.forEach((input) => { input.value = String(value); });
    commitTargets();
  }
}

function equaliseBanks(): void {
  const target = average(readTargets());
  inputs.forEach((input) => { input.value = target.toFixed(1); });
  commitTargets();
}

function insertAll(): void {
  inputs.forEach((input) => { input.value = "100"; });
  const master = byId<HTMLInputElement>("rod-control");
  if (master) {
    master.value = "100";
    master.dispatchEvent(new Event("input", { bubbles: true }));
  }
  commitTargets();
}

function updateSnapshot(snapshot: ReactorSnapshot): void {
  lastSnapshot = snapshot;
  snapshot.rodBankPositions.forEach((position, index) => {
    const actual = byId<HTMLElement>(`rod-bank-actual-${index}`);
    if (actual) actual.textContent = `実位置 ${position.toFixed(1)}%`;
  });
  const spread = byId<HTMLElement>("rod-bank-spread");
  if (spread) {
    spread.textContent = `${snapshot.rodBankSpreadPercent.toFixed(1)}%`;
    spread.classList.toggle("warning", snapshot.rodBankSpreadPercent >= 12);
    spread.classList.toggle("critical", snapshot.rodBankSpreadPercent >= 22);
  }
  const peak = byId<HTMLElement>("rod-bank-peak-factor");
  if (peak) {
    peak.textContent = `${snapshot.corePeakFactor.toFixed(2)} · CH ${snapshot.corePeakChannelIndex + 1}`;
    peak.classList.toggle("warning", snapshot.corePeakFactor >= 1.45);
    peak.classList.toggle("critical", snapshot.corePeakFactor >= 1.7);
  }
  const channels = document.querySelectorAll<HTMLElement>("#core-map .core-channel");
  snapshot.coreCells.forEach((cell, index) => {
    const channel = channels[index];
    if (!channel || !cell.active) return;
    channel.dataset.bank = String(cell.bankIndex);
    channel.dataset.index = String(cell.index);
    channel.dataset.value = String(cell.power);
    channel.classList.toggle("core-peak-channel", cell.index === snapshot.corePeakChannelIndex);
  });
}

function install(): void {
  const grid = document.querySelector<HTMLElement>(".rod-bank-grid");
  const section = grid?.closest<HTMLElement>("section");
  if (!grid || !section) {
    requestAnimationFrame(install);
    return;
  }
  if (byId("independent-bank-controls")) return;

  inputs = [...grid.querySelectorAll<HTMLInputElement>("[data-rod-bank]")];
  if (inputs.length !== 4) return;

  inputs.forEach((input, index) => {
    input.closest("label")?.insertAdjacentHTML("beforeend", `<small id="rod-bank-actual-${index}" class="rod-bank-actual">実位置 --</small>`);
    input.addEventListener("input", () => {
      if (mode !== "independent") return;
      commitTargets();
    });
  });

  const controls = document.createElement("div");
  controls.id = "independent-bank-controls";
  controls.className = "independent-bank-controls";
  controls.innerHTML = `
    <div class="bank-mode-selector" role="group" aria-label="制御棒バンク操作モード">
      <button type="button" data-bank-mode="synchronised" aria-pressed="true">同期</button>
      <button type="button" data-bank-mode="independent" aria-pressed="false">個別</button>
    </div>
    <p id="rod-bank-mode-description">一括制御棒指令で4バンクを同時操作</p>
    <div class="bank-diagnostics">
      <span>目標平均 <b id="rod-bank-target-average">100.0%</b></span>
      <span>実位置偏差 <b id="rod-bank-spread">0.0%</b></span>
      <span>炉心ピーク <b id="rod-bank-peak-factor">1.00</b></span>
    </div>
    <div class="bank-quick-actions">
      <button type="button" id="rod-bank-equalise">平均化</button>
      <button type="button" id="rod-bank-insert-all">全挿入</button>
    </div>`;
  grid.insertAdjacentElement("beforebegin", controls);

  controls.querySelectorAll<HTMLButtonElement>("[data-bank-mode]").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.bankMode as BankMode));
  });
  byId("rod-bank-equalise")?.addEventListener("click", equaliseBanks);
  byId("rod-bank-insert-all")?.addEventListener("click", insertAll);

  const master = byId<HTMLInputElement>("rod-control");
  master?.addEventListener("input", () => {
    if (mode !== "synchronised") return;
    inputs.forEach((input) => { input.value = master.value; });
    commitTargets();
  });

  window.addEventListener(RBMK_SNAPSHOT_EVENT, (event) => {
    updateSnapshot((event as CustomEvent<ReactorSnapshot>).detail);
  });

  section.querySelector("small")?.remove();
  const note = document.createElement("small");
  note.className = "rod-bank-physics-note";
  note.textContent = "A/B/C/Dは炉心の左前・右前・左後・右後へ独立して作用します。";
  section.append(note);
  updateInputReadouts();
  setMode("synchronised");
}

queueMicrotask(install);
