type RangeDescriptor = {
  id: string;
  label: string;
  fineStep?: number;
};

const controlledRanges: RangeDescriptor[] = [
  { id: "rod-control", label: "制御棒", fineStep: 0.5 },
  { id: "flow-control", label: "主循環流量", fineStep: 0.5 },
  { id: "feedwater-control", label: "給水流量", fineStep: 0.5 },
  { id: "level-control", label: "水位", fineStep: 0.5 },
  { id: "bypass-control", label: "バイパス", fineStep: 1 },
  { id: "valve-control", label: "調速弁", fineStep: 0.5 },
];

function changeRange(input: HTMLInputElement, delta: number): void {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const next = Math.min(max, Math.max(min, Number(input.value) + delta));
  input.value = String(next);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function bindRepeatingButton(button: HTMLButtonElement, action: () => void): void {
  let delayTimer: number | undefined;
  let repeatTimer: number | undefined;

  const stop = (): void => {
    if (delayTimer !== undefined) window.clearTimeout(delayTimer);
    if (repeatTimer !== undefined) window.clearInterval(repeatTimer);
    delayTimer = undefined;
    repeatTimer = undefined;
  };

  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    action();
    delayTimer = window.setTimeout(() => {
      repeatTimer = window.setInterval(action, 90);
    }, 420);
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointercancel", stop);
  button.addEventListener("lostpointercapture", stop);
  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") action();
  });
}

function enhanceRange(descriptor: RangeDescriptor): void {
  const input = document.getElementById(descriptor.id) as HTMLInputElement | null;
  if (!input || input.dataset.touchEnhanced === "true") return;
  input.dataset.touchEnhanced = "true";

  const step = descriptor.fineStep ?? Number(input.step || 1);
  const controls = document.createElement("span");
  controls.className = "range-fine-controls";
  controls.setAttribute("aria-label", `${descriptor.label}微調整`);
  controls.innerHTML = `
    <button type="button" class="range-minus" aria-label="${descriptor.label}を${step}下げる">−</button>
    <button type="button" class="range-plus" aria-label="${descriptor.label}を${step}上げる">＋</button>
  `;

  const minus = controls.querySelector<HTMLButtonElement>(".range-minus");
  const plus = controls.querySelector<HTMLButtonElement>(".range-plus");
  if (minus) bindRepeatingButton(minus, () => changeRange(input, -step));
  if (plus) bindRepeatingButton(plus, () => changeRange(input, step));

  input.insertAdjacentElement("afterend", controls);
}

function deduplicateEventTape(): void {
  const log = document.getElementById("event-log");
  if (!log) return;

  const observer = new MutationObserver(() => {
    const rows = [...log.querySelectorAll<HTMLParagraphElement>("p")];
    const seen = new Map<string, HTMLParagraphElement>();
    for (const row of rows) {
      const normalized = row.textContent?.replace(/^現在|^-\d+|^操作/, "").trim() ?? "";
      if (!normalized) continue;
      const previous = seen.get(normalized);
      if (!previous) {
        seen.set(normalized, row);
        continue;
      }
      if (row.classList.contains("suite-event")) continue;
      row.remove();
    }
  });
  observer.observe(log, { childList: true });
}

function installTouchControls(): void {
  const ready = controlledRanges.every((item) => document.getElementById(item.id));
  if (!ready) {
    requestAnimationFrame(installTouchControls);
    return;
  }
  controlledRanges.forEach(enhanceRange);
  deduplicateEventTape();
}

queueMicrotask(installTouchControls);
