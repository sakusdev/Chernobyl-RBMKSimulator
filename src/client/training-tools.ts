type Disturbance = {
  id: string;
  title: string;
  description: string;
  apply: () => void;
};

function element<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function setRange(id: string, value: number): void {
  const input = element<HTMLInputElement>(id);
  if (!input) return;
  input.value = String(value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function activeCount(selector: string): number {
  return document.querySelectorAll(`${selector}.running`).length;
}

function clickCount(selector: string, count: number): void {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>(selector)];
  const current = activeCount(selector);
  if (current === count || buttons.length === 0) return;
  if (count <= 0) {
    if (current > 0) buttons[0]?.click();
    return;
  }
  buttons[Math.min(count - 1, buttons.length - 1)]?.click();
}

function record(message: string): void {
  const log = element("event-log");
  if (!log) return;
  const row = document.createElement("p");
  row.className = "training-event";
  row.dataset.timestamp = new Date().toISOString();
  row.innerHTML = `<time>訓練</time>${message}`;
  log.prepend(row);
}

const disturbances: Disturbance[] = [
  {
    id: "mcp-trip",
    title: "循環ポンプ1台トリップ",
    description: "現在運転中の主循環ポンプを1台減らします",
    apply: () => {
      const next = Math.max(0, activeCount("[data-pump]") - 1);
      clickCount("[data-pump]", next);
      record(`主循環ポンプ1台トリップ・残り${next}台`);
    },
  },
  {
    id: "feedwater-loss",
    title: "給水喪失",
    description: "給水ポンプを全停止し、給水設定を0%へ下げます",
    apply: () => {
      clickCount("[data-fwp]", 0);
      setRange("feedwater-control", 0);
      record("全給水ポンプ停止・給水流量0%");
    },
  },
  {
    id: "bypass-open",
    title: "バイパス弁全開",
    description: "タービンバイパスを100%へ開きます",
    apply: () => {
      setRange("bypass-control", 100);
      record("タービンバイパス弁が全開位置へ移動");
    },
  },
  {
    id: "turbine-trip",
    title: "タービントリップ",
    description: "タービン停止ボタンを作動させます",
    apply: () => {
      element<HTMLButtonElement>("trip-button")?.click();
      record("タービントリップ信号を注入");
    },
  },
  {
    id: "breaker-open",
    title: "発電機解列",
    description: "投入中の場合、発電機遮断器を開放します",
    apply: () => {
      const breaker = element<HTMLButtonElement>("breaker-button");
      if (breaker?.classList.contains("closed")) breaker.click();
      record("発電機遮断器開放・系統解列");
    },
  },
  {
    id: "rod-withdrawal",
    title: "制御棒引抜誤操作",
    description: "制御棒挿入率を現在値から15ポイント低下させます",
    apply: () => {
      const rod = element<HTMLInputElement>("rod-control");
      const next = Math.max(0, Number(rod?.value ?? 100) - 15);
      setRange("rod-control", next);
      record(`制御棒引抜誤操作・一括挿入率${next.toFixed(1)}%`);
    },
  },
];

function download(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function collectEvents(): Array<{ label: string; message: string; timestamp: string | null }> {
  return [...document.querySelectorAll<HTMLElement>("#event-log p")].map((row) => ({
    label: row.querySelector("time")?.textContent?.trim() ?? "",
    message: row.textContent?.replace(row.querySelector("time")?.textContent ?? "", "").trim() ?? "",
    timestamp: row.dataset.timestamp ?? null,
  }));
}

function exportJson(): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    panel: {
      rodInsertion: element<HTMLInputElement>("rod-control")?.value,
      coolantFlow: element<HTMLInputElement>("flow-control")?.value,
      feedwaterFlow: element<HTMLInputElement>("feedwater-control")?.value,
      separatorLevel: element<HTMLInputElement>("level-control")?.value,
      bypassValve: element<HTMLInputElement>("bypass-control")?.value,
      turbineValve: element<HTMLInputElement>("valve-control")?.value,
      mainCirculationPumps: activeCount("[data-pump]"),
      feedwaterPumps: activeCount("[data-fwp]"),
      generatorBreakerClosed: element("breaker-button")?.classList.contains("closed") ?? false,
    },
    events: collectEvents(),
  };
  download(`rbmk-operation-${Date.now()}.json`, JSON.stringify(payload, null, 2), "application/json");
  record("操作記録をJSON形式で書き出し");
}

function exportCsv(): void {
  const rows = [["label", "message", "timestamp"], ...collectEvents().map((event) => [event.label, event.message, event.timestamp ?? ""])];
  const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
  download(`rbmk-events-${Date.now()}.csv`, `\uFEFF${csv}`, "text/csv;charset=utf-8");
  record("操作記録をCSV形式で書き出し");
}

function installTrainingTools(): void {
  const body = document.querySelector<HTMLElement>("#operations-suite .suite-body");
  if (!body || document.getElementById("training-tools")) return;
  const panel = document.createElement("section");
  panel.id = "training-tools";
  panel.className = "training-tools";
  panel.innerHTML = `
    <h3>故障・外乱注入</h3>
    <div class="disturbance-grid">
      ${disturbances.map((item) => `<button data-disturbance="${item.id}" title="${item.description}">${item.title}</button>`).join("")}
    </div>
    <h3>記録出力</h3>
    <div class="export-grid"><button id="export-json">JSON書出</button><button id="export-csv">CSV書出</button></div>
  `;
  const actions = body.querySelector(".suite-actions");
  body.insertBefore(panel, actions ?? null);
  panel.querySelectorAll<HTMLButtonElement>("[data-disturbance]").forEach((button) => {
    button.addEventListener("click", () => disturbances.find((item) => item.id === button.dataset.disturbance)?.apply());
  });
  element("export-json")?.addEventListener("click", exportJson);
  element("export-csv")?.addEventListener("click", exportCsv);
}

const observer = new MutationObserver(installTrainingTools);
observer.observe(document.documentElement, { childList: true, subtree: true });
queueMicrotask(installTrainingTools);
