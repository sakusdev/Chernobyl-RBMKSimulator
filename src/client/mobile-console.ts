type ConsoleSection = {
  id: string;
  label: string;
  selector: string;
};

const sections: ConsoleSection[] = [
  { id: "alarms", label: "警報", selector: ".annunciator-wall" },
  { id: "core", label: "炉心", selector: ".reactor-wall" },
  { id: "systems", label: "系統", selector: ".mimic-wall" },
  { id: "reactor", label: "炉操作", selector: ".siur-desk" },
  { id: "plant", label: "プラント", selector: ".siub-desk" },
  { id: "turbine", label: "タービン", selector: ".siut-desk" },
  { id: "records", label: "記録", selector: ".lower-strip" },
];

const STORAGE_KEY = "rbmk-mobile-console-preferences";

type Preferences = {
  zoom: number;
  compact: boolean;
};

const defaultPreferences: Preferences = { zoom: 0.78, compact: false };

function loadPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Preferences> | null;
    return {
      zoom: Math.min(1.25, Math.max(0.5, saved?.zoom ?? defaultPreferences.zoom)),
      compact: Boolean(saved?.compact),
    };
  } catch {
    return defaultPreferences;
  }
}

function savePreferences(preferences: Preferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

function applyZoom(value: number): void {
  const shell = document.querySelector<HTMLElement>(".bshch-shell");
  if (!shell) return;
  shell.style.setProperty("--mobile-console-zoom", String(value));
  shell.style.zoom = String(value);
  document.documentElement.style.setProperty("--mobile-console-zoom", String(value));
}

function installMobileConsole(): void {
  if (document.getElementById("mobile-console-bar")) return;
  const shell = document.querySelector<HTMLElement>(".bshch-shell");
  if (!shell) {
    requestAnimationFrame(installMobileConsole);
    return;
  }

  const preferences = loadPreferences();
  applyZoom(preferences.zoom);
  document.body.classList.toggle("console-compact", preferences.compact);

  const bar = document.createElement("nav");
  bar.id = "mobile-console-bar";
  bar.className = "mobile-console-bar";
  bar.setAttribute("aria-label", "制御室区画ナビゲーション");
  bar.innerHTML = `
    <button class="mobile-menu-toggle" aria-expanded="false">区画</button>
    <div class="mobile-section-buttons">
      ${sections.map((section) => `<button data-console-section="${section.id}">${section.label}</button>`).join("")}
    </div>
    <label class="mobile-zoom-control">倍率
      <input id="mobile-console-zoom" type="range" min="0.5" max="1.25" step="0.05" value="${preferences.zoom}">
      <output>${Math.round(preferences.zoom * 100)}%</output>
    </label>
    <button id="mobile-console-compact" aria-pressed="${preferences.compact}">省スペース</button>
    <button id="mobile-console-home">先頭</button>
    <span id="mobile-console-health" class="mobile-console-health">監視中</span>
  `;
  document.body.append(bar);

  const menuToggle = bar.querySelector<HTMLButtonElement>(".mobile-menu-toggle");
  menuToggle?.addEventListener("click", () => {
    const open = bar.classList.toggle("menu-open");
    menuToggle.setAttribute("aria-expanded", String(open));
  });

  bar.querySelectorAll<HTMLButtonElement>("[data-console-section]").forEach((button) => {
    button.addEventListener("click", () => {
      const section = sections.find((item) => item.id === button.dataset.consoleSection);
      const target = section ? document.querySelector<HTMLElement>(section.selector) : null;
      target?.scrollIntoView({ behavior: "smooth", block: "start", inline: "start" });
      bar.classList.remove("menu-open");
      menuToggle?.setAttribute("aria-expanded", "false");
    });
  });

  const zoomInput = bar.querySelector<HTMLInputElement>("#mobile-console-zoom");
  const zoomOutput = bar.querySelector<HTMLOutputElement>(".mobile-zoom-control output");
  zoomInput?.addEventListener("input", () => {
    preferences.zoom = Number(zoomInput.value);
    applyZoom(preferences.zoom);
    if (zoomOutput) zoomOutput.value = `${Math.round(preferences.zoom * 100)}%`;
    savePreferences(preferences);
  });

  bar.querySelector<HTMLButtonElement>("#mobile-console-compact")?.addEventListener("click", (event) => {
    preferences.compact = !preferences.compact;
    document.body.classList.toggle("console-compact", preferences.compact);
    (event.currentTarget as HTMLButtonElement).setAttribute("aria-pressed", String(preferences.compact));
    savePreferences(preferences);
  });

  bar.querySelector<HTMLButtonElement>("#mobile-console-home")?.addEventListener("click", () => {
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  });

  installHealthMonitor(bar.querySelector<HTMLElement>("#mobile-console-health"));
}

function installHealthMonitor(output: HTMLElement | null): void {
  if (!output) return;
  let previousClock = "";
  let unchangedTicks = 0;

  window.setInterval(() => {
    const clock = document.getElementById("wall-clock")?.textContent?.trim() ?? "";
    const activeAlarms = document.querySelectorAll(".annunciator.active").length;
    const criticalAlarms = document.querySelectorAll(".annunciator.active.critical").length;

    if (clock && clock === previousClock && !document.hidden) unchangedTicks += 1;
    else unchangedTicks = 0;
    previousClock = clock;

    if (unchangedTicks >= 4) {
      output.textContent = "計算停止の可能性";
      output.dataset.state = "fault";
    } else if (criticalAlarms > 0) {
      output.textContent = `重大 ${criticalAlarms}`;
      output.dataset.state = "critical";
    } else if (activeAlarms > 0) {
      output.textContent = `警報 ${activeAlarms}`;
      output.dataset.state = "warning";
    } else {
      output.textContent = "正常監視";
      output.dataset.state = "normal";
    }
  }, 1500);
}

queueMicrotask(installMobileConsole);
