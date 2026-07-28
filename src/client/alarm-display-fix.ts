const alarmLabels: Record<string, string> = {
  "原子炉出力高": "МОЩНОСТЬ РЕАКТОРА ВЫСОКА",
  "原子炉周期短": "МАЛЫЙ ПЕРИОД РЕАКТОРА",
  "気水分離器圧力高": "ДАВЛЕНИЕ БС ВЫСОКО",
  "主循環流量低": "РАСХОД ГЦК НИЗКИЙ",
  "気水分離器水位低": "УРОВЕНЬ БС НИЗКИЙ",
  "気水分離器水位高": "УРОВЕНЬ БС ВЫСОКИЙ",
  "燃料温度高": "ТЕМПЕРАТУРА ТОПЛИВА ВЫСОКА",
  "ボイド率高": "ПАРОСОДЕРЖАНИЕ ВЫСОКО",
  "タービン過速度": "РАЗГОН ТУРБИНЫ",
  "復水器真空低": "ВАКУУМ КОНДЕНСАТОРА НИЗКИЙ",
  "発電機未同期": "ГЕНЕРАТОР НЕ СИНХРОНИЗИРОВАН",
  "AZ-5作動": "АЗ-5 ВВЕДЕНА",
};

const eventTranslations: Array<[RegExp, string]> = [
  [/警報\s*:\s*РАЗГОН ТУРБИНЫ/g, "警報：タービン過速度"],
  [/警報\s*:\s*ПАРОСОДЕРЖАНИЕ ВЫСОКО/g, "警報：ボイド率高"],
  [/警報\s*:\s*ТЕМПЕРАТУРА ТОПЛИВА ВЫСОКА/g, "警報：燃料温度高"],
  [/警報\s*:\s*МОЩНОСТЬ РЕАКТОРА ВЫСОКА/g, "警報：原子炉出力高"],
  [/警報\s*:\s*МАЛЫЙ ПЕРИОД РЕАКТОРА/g, "警報：原子炉周期短"],
  [/警報\s*:\s*ДАВЛЕНИЕ БС ВЫСОКО/g, "警報：気水分離器圧力高"],
  [/警報\s*:\s*РАСХОД ГЦК НИЗКИЙ/g, "警報：主循環流量低"],
  [/警報\s*:\s*УРОВЕНЬ БС НИЗКИЙ/g, "警報：気水分離器水位低"],
  [/警報\s*:\s*УРОВЕНЬ БС ВЫСОКИЙ/g, "警報：気水分離器水位高"],
  [/警報\s*:\s*ВАКУУМ КОНДЕНСАТОРА НИЗКИЙ/g, "警報：復水器真空低"],
  [/警報\s*:\s*ГЕНЕРАТОР НЕ СИНХРОНИЗИРОВАН/g, "警報：発電機未同期"],
  [/警報\s*:\s*АЗ-5 ВВЕДЕНА/g, "警報：AZ-5作動"],
];

function installAlarmCompatibility(): void {
  const nodes = document.querySelectorAll<HTMLElement>(".annunciator");
  if (!nodes.length) return;

  const textContentDescriptor = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
  if (!textContentDescriptor?.set) return;

  nodes.forEach((node) => {
    if (node.dataset.alarmCompatibility === "installed") return;
    const japaneseLabel = node.textContent?.trim() ?? "";
    const sourceMessage = alarmLabels[japaneseLabel];
    if (!sourceMessage) return;

    node.dataset.jaLabel = japaneseLabel;
    node.dataset.alarmCompatibility = "installed";
    Object.defineProperty(node, "textContent", {
      configurable: true,
      get: () => sourceMessage,
      set: (value: string | null) => textContentDescriptor.set?.call(node, value),
    });
  });
}

function localizeEventLog(): void {
  document.querySelectorAll<HTMLElement>("#event-log p").forEach((row) => {
    let text = row.textContent ?? "";
    for (const [pattern, replacement] of eventTranslations) text = text.replace(pattern, replacement);
    if (text !== row.textContent) {
      const time = row.querySelector("time")?.textContent ?? "";
      const body = text.startsWith(time) ? text.slice(time.length) : text;
      row.innerHTML = `<time>${time}</time>${body}`;
    }
  });
}

function start(): void {
  installAlarmCompatibility();
  localizeEventLog();
  const root = document.querySelector("#app");
  if (!root) return;
  new MutationObserver(() => {
    installAlarmCompatibility();
    localizeEventLog();
  }).observe(root, { subtree: true, childList: true, characterData: true });
}

queueMicrotask(start);
