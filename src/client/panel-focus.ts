const focusSelectors = [
  ".annunciator-wall",
  ".reactor-wall",
  ".mimic-wall",
  ".siur-desk",
  ".siub-desk",
  ".siut-desk",
  ".lower-strip",
];

let focusedPanel: HTMLElement | null = null;
let placeholder: Comment | null = null;
let originalScrollX = 0;
let originalScrollY = 0;

function closeFocus(): void {
  if (!focusedPanel || !placeholder?.parentNode) return;
  placeholder.parentNode.replaceChild(focusedPanel, placeholder);
  focusedPanel.classList.remove("panel-focus-active");
  focusedPanel = null;
  placeholder = null;
  document.body.classList.remove("panel-focus-open");
  document.getElementById("panel-focus-layer")?.remove();
  window.scrollTo(originalScrollX, originalScrollY);
}

function openFocus(panel: HTMLElement): void {
  if (focusedPanel === panel) return;
  closeFocus();

  originalScrollX = window.scrollX;
  originalScrollY = window.scrollY;
  placeholder = document.createComment("panel focus placeholder");
  panel.parentNode?.insertBefore(placeholder, panel);

  const layer = document.createElement("div");
  layer.id = "panel-focus-layer";
  layer.className = "panel-focus-layer";
  layer.innerHTML = `
    <header>
      <strong>盤面フォーカス</strong>
      <span>ピンチ操作またはブラウザ拡大も使用できます</span>
      <button type="button" id="panel-focus-close">閉じる</button>
    </header>
    <div class="panel-focus-viewport"></div>
  `;
  document.body.append(layer);
  layer.querySelector(".panel-focus-viewport")?.append(panel);
  panel.classList.add("panel-focus-active");
  focusedPanel = panel;
  document.body.classList.add("panel-focus-open");
  layer.querySelector<HTMLButtonElement>("#panel-focus-close")?.focus();
  layer.querySelector<HTMLButtonElement>("#panel-focus-close")?.addEventListener("click", closeFocus);
}

function installPanelFocus(): void {
  const panels = focusSelectors.flatMap((selector) => [...document.querySelectorAll<HTMLElement>(selector)]);
  if (!panels.length) {
    requestAnimationFrame(installPanelFocus);
    return;
  }

  for (const panel of panels) {
    if (panel.dataset.focusReady === "true") continue;
    panel.dataset.focusReady = "true";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "panel-focus-button";
    button.textContent = "拡大";
    button.setAttribute("aria-label", "この盤面を全画面表示");
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openFocus(panel);
    });
    panel.append(button);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeFocus();
  });
}

queueMicrotask(installPanelFocus);
