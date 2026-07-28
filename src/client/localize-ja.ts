const exactTranslations = new Map<string, string>([
  ["МОЩНОСТЬ РЕАКТОРА ВЫСОКА", "原子炉出力高"],
  ["МАЛЫЙ ПЕРИОД РЕАКТОРА", "原子炉周期短"],
  ["ДАВЛЕНИЕ БС ВЫСОКО", "気水分離器圧力高"],
  ["РАСХОД ГЦК НИЗКИЙ", "主循環流量低"],
  ["УРОВЕНЬ БС НИЗКИЙ", "気水分離器水位低"],
  ["УРОВЕНЬ БС ВЫСОКИЙ", "気水分離器水位高"],
  ["ТЕМПЕРАТУРА ТОПЛИВА", "燃料温度高"],
  ["ПАРОСОДЕРЖАНИЕ", "ボイド率高"],
  ["РАЗГОН ТУРБИНЫ", "タービン過速度"],
  ["ВАКУУМ КОНДЕНСАТОРА", "復水器真空低"],
  ["ГЕНЕРАТОР НЕ СИНХР.", "発電機未同期"],
  ["АЗ-5 ВВЕДЕНА", "AZ-5作動"],
  ["ЧЕРНОБЫЛЬСКАЯ АЭС · БЛОК 3", "チョルノービリ原子力発電所・3号機"],
  ["БЛОЧНЫЙ ЩИТ УПРАВЛЕНИЯ РБМК-1000", "RBMK-1000 中央制御室"],
  ["ВРЕМЯ", "時刻"],
  ["РЕЖИМ", "運転状態"],
  ["ЯДРО", "計算コア"],
  ["ЗАПУСК…", "起動中…"],
  ["ПАУЗА", "一時停止"],
  ["СБРОС", "リセット"],
  ["АВАРИЙНАЯ СИГНАЛИЗАЦИЯ", "警報表示盤"],
  ["ФИЗИЧЕСКИЙ КОНТРОЛЬ РЕАКТОРА", "原子炉物理監視盤"],
  ["МОЩНОСТЬ", "出力"],
  ["ТЕМП. ТОПЛИВА", "燃料温度"],
  ["КСЕНОН-135", "キセノン135"],
  ["ПОГРУЖЕНИЕ СУЗ", "制御棒挿入率"],
  ["МОЩН.", "出力"],
  ["ПЕРИОД", "周期"],
  ["РЕАКТ.", "反応度"],
  ["ТЕПЛОВАЯ СХЕМА БЛОКА", "プラント熱系統図"],
  ["РЕАКТОР", "原子炉"],
  ["ГЦН-А", "MCP-A"],
  ["ГЦН-Б", "MCP-B"],
  ["БС", "気水分離器"],
  ["КОНД.", "復水器"],
  ["ДАВЛ.", "圧力"],
  ["ПАР", "蒸気"],
  ["ВАКУУМ", "真空"],
  ["СИУР", "炉主任"],
  ["СТАРШИЙ ИНЖЕНЕР УПРАВЛЕНИЯ РЕАКТОРОМ", "原子炉運転主任席"],
  ["ТЕПЛОВАЯ", "熱出力"],
  ["сек", "秒"],
  ["СУЗ ОБЩАЯ", "制御棒一括挿入"],
  ["ПОЛЕ КСЕНОНА", "キセノン分布"],
  ["ПАРОСОДЕРЖ.", "ボイド率"],
  ["АВАРИЙНАЯ ЗАЩИТА", "緊急停止"],
  ["СИУБ", "ブロック主任"],
  ["СТАРШИЙ ИНЖЕНЕР УПРАВЛЕНИЯ БЛОКОМ", "プラント運転主任席"],
  ["ГЦН", "主循環ポンプ"],
  ["ПЭН", "給水ポンプ"],
  ["РАСХОД ГЦК", "主循環流量"],
  ["ПИТАТ. ВОДА", "給水流量"],
  ["УРОВЕНЬ БС", "気水分離器水位"],
  ["БАЙПАС БРОУ-К", "タービンバイパス"],
  ["СИУТ", "タービン主任"],
  ["СТАРШИЙ ИНЖЕНЕР УПРАВЛЕНИЯ ТУРБИНОЙ", "タービン運転主任席"],
  ["ОБОРОТЫ", "回転数"],
  ["об/мин", "rpm"],
  ["ЧАСТОТА", "周波数"],
  ["Гц", "Hz"],
  ["РЕГУЛИР. КЛАПАН", "タービン調速弁"],
  ["НАПРЯЖЕНИЕ", "発電機電圧"],
  ["ВЫКЛЮЧАТЕЛЬ", "遮断器"],
  ["ГЕНЕРАТОРА", "発電機"],
  ["СТОП ТУРБИНЫ", "タービントリップ"],
  ["СУЗ", "制御棒"],
  ["ТЕМП.", "温度"],
  ["СЕЙЧАС", "現在"],
  ["ОСТАНОВ", "停止"],
  ["ПУСК", "起動"],
]);

const phraseTranslations: Array<[RegExp, string]> = [
  [/БЩУ: запуск вычислительного ядра/g, "中央制御室：計算コアを起動"],
  [/ГЦН: в работе (\d+)/g, "主循環ポンプ：$1台運転"],
  [/ПЭН: в работе (\d+)/g, "給水ポンプ：$1台運転"],
  [/АЗ-1: снижение мощности/g, "AZ-1：出力低下操作"],
  [/АЗ-2: ускоренное снижение мощности/g, "AZ-2：急速出力低下"],
  [/АЗ-5: аварийная защита введена/g, "AZ-5：緊急停止作動"],
  [/ТУРБИНА: стопорные клапаны закрыты/g, "タービン：主蒸気止め弁閉"],
  [/ГЕНЕРАТОР: выключатель включен/g, "発電機：遮断器投入"],
  [/ГЕНЕРАТОР: выключатель отключен/g, "発電機：遮断器開放"],
  [/БЛОК: состояние сброшено/g, "プラント：状態をリセット"],
  [/СИГНАЛ:/g, "警報："],
  [/SIMULATION SPEED/g, "シミュレーション速度"],
  [/SIMULATION ERROR/g, "シミュレーションエラー"],
  [/TYPESCRIPT CORE READY/g, "TypeScript計算コア準備完了"],
  [/WASM CORE READY/g, "WASM計算コア準備完了"],
];

function translateText(text: string): string {
  const trimmed = text.trim();
  const exact = exactTranslations.get(trimmed);
  if (exact) return text.replace(trimmed, exact);

  let translated = text;
  for (const [pattern, replacement] of phraseTranslations) {
    translated = translated.replace(pattern, replacement);
  }
  return translated;
}

function localizeNode(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE && root.textContent) {
    const translated = translateText(root.textContent);
    if (translated !== root.textContent) root.textContent = translated;
    return;
  }

  if (!(root instanceof Element || root instanceof DocumentFragment || root instanceof Document)) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!node.textContent) continue;
    const translated = translateText(node.textContent);
    if (translated !== node.textContent) node.textContent = translated;
  }

  if (root instanceof Element) {
    const ariaLabel = root.getAttribute("aria-label");
    if (ariaLabel) {
      root.setAttribute("aria-label", ariaLabel
        .replace("Карта энерговыделения активной зоны", "炉心出力分布図")
        .replace("Упрощенная тепловая схема РБМК", "RBMK簡易熱系統図"));
    }
  }
}

function startLocalization(): void {
  const app = document.querySelector("#app");
  if (!app) return;
  localizeNode(app);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        localizeNode(mutation.target);
      }
      for (const addedNode of mutation.addedNodes) localizeNode(addedNode);
    }
  });

  observer.observe(app, { subtree: true, childList: true, characterData: true });
}

queueMicrotask(startLocalization);
