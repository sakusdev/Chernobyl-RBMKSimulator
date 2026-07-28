type AudioPrefs = {
  enabled: boolean;
  master: number;
  alarms: number;
  machinery: number;
  controls: number;
  ambient: number;
};

type ContinuousVoice = {
  gain: GainNode;
  oscillators: OscillatorNode[];
};

const AUDIO_STORAGE_KEY = "rbmk-audio-preferences";
const DEFAULT_AUDIO_PREFS: AudioPrefs = {
  enabled: true,
  master: 0.72,
  alarms: 0.82,
  machinery: 0.58,
  controls: 0.68,
  ambient: 0.42,
};

class ControlRoomAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private alarmBus: GainNode | null = null;
  private machineryBus: GainNode | null = null;
  private controlBus: GainNode | null = null;
  private ambientBus: GainNode | null = null;
  private prefs = this.loadPrefs();
  private unlocked = false;
  private ambientVoice: ContinuousVoice | null = null;
  private pumpVoice: ContinuousVoice | null = null;
  private turbineVoice: ContinuousVoice | null = null;
  private previousAlarmIds = new Set<string>();
  private lastCriticalReminder = 0;
  private previousPumpCount = 0;
  private previousFeedPumpCount = 0;
  private previousBreaker = false;
  private previousTrip = false;
  private previousAz5 = false;

  public install(): void {
    this.renderPanel();
    this.bindUnlock();
    this.bindOperationSounds();
    this.startPlantObserver();
    this.refreshPanel();
  }

  private loadPrefs(): AudioPrefs {
    try {
      const value = JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY) ?? "null") as Partial<AudioPrefs> | null;
      return {
        enabled: value?.enabled ?? DEFAULT_AUDIO_PREFS.enabled,
        master: this.clamp(value?.master ?? DEFAULT_AUDIO_PREFS.master),
        alarms: this.clamp(value?.alarms ?? DEFAULT_AUDIO_PREFS.alarms),
        machinery: this.clamp(value?.machinery ?? DEFAULT_AUDIO_PREFS.machinery),
        controls: this.clamp(value?.controls ?? DEFAULT_AUDIO_PREFS.controls),
        ambient: this.clamp(value?.ambient ?? DEFAULT_AUDIO_PREFS.ambient),
      };
    } catch {
      return { ...DEFAULT_AUDIO_PREFS };
    }
  }

  private savePrefs(): void {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(this.prefs));
  }

  private clamp(value: number): number {
    return Math.min(1, Math.max(0, value));
  }

  private ensureAudio(): AudioContext | null {
    if (this.context) return this.context;
    try {
      const context = new AudioContext({ latencyHint: "interactive" });
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 20;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.24;

      this.master = context.createGain();
      this.alarmBus = context.createGain();
      this.machineryBus = context.createGain();
      this.controlBus = context.createGain();
      this.ambientBus = context.createGain();

      for (const bus of [this.alarmBus, this.machineryBus, this.controlBus, this.ambientBus]) {
        bus.connect(this.master);
      }
      this.master.connect(compressor).connect(context.destination);
      this.context = context;
      this.applyVolumes();
      return context;
    } catch {
      return null;
    }
  }

  private async unlock(): Promise<void> {
    const context = this.ensureAudio();
    if (!context) return;
    if (context.state !== "running") await context.resume();
    this.unlocked = context.state === "running";
    document.body.classList.toggle("audio-unlocked", this.unlocked);
    this.refreshPanel();
    if (this.unlocked && this.prefs.enabled) {
      this.playRelay(0.55);
      this.ensureAmbient();
    }
  }

  private applyVolumes(): void {
    if (!this.context || !this.master || !this.alarmBus || !this.machineryBus || !this.controlBus || !this.ambientBus) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.prefs.enabled ? this.prefs.master : 0, now, 0.03);
    this.alarmBus.gain.setTargetAtTime(this.prefs.alarms, now, 0.03);
    this.machineryBus.gain.setTargetAtTime(this.prefs.machinery, now, 0.03);
    this.controlBus.gain.setTargetAtTime(this.prefs.controls, now, 0.03);
    this.ambientBus.gain.setTargetAtTime(this.prefs.ambient, now, 0.03);
  }

  private renderPanel(): void {
    if (document.getElementById("audio-control-panel")) return;
    const panel = document.createElement("aside");
    panel.id = "audio-control-panel";
    panel.className = "audio-control-panel collapsed";
    panel.innerHTML = `
      <button id="audio-panel-toggle" class="audio-panel-toggle" aria-expanded="false">音響</button>
      <div class="audio-panel-body">
        <header><strong>制御室音響</strong><span id="audio-status">未有効</span></header>
        <button id="audio-enable" class="audio-enable">音響を有効化</button>
        ${this.volumeSlider("master", "全体")}
        ${this.volumeSlider("alarms", "警報")}
        ${this.volumeSlider("machinery", "機械")}
        ${this.volumeSlider("controls", "操作音")}
        ${this.volumeSlider("ambient", "環境音")}
        <div class="audio-panel-actions">
          <button id="audio-mute">ミュート</button>
          <button id="audio-test">警報試験</button>
        </div>
        <small>最初のタップでブラウザの音声再生を開始します。</small>
      </div>`;
    document.body.append(panel);

    panel.querySelector("#audio-panel-toggle")?.addEventListener("click", () => {
      const collapsed = panel.classList.toggle("collapsed");
      panel.querySelector("#audio-panel-toggle")?.setAttribute("aria-expanded", String(!collapsed));
    });
    panel.querySelector("#audio-enable")?.addEventListener("click", () => void this.unlock());
    panel.querySelector("#audio-mute")?.addEventListener("click", () => {
      this.prefs.enabled = !this.prefs.enabled;
      this.applyVolumes();
      this.savePrefs();
      this.refreshPanel();
      if (this.prefs.enabled) void this.unlock();
    });
    panel.querySelector("#audio-test")?.addEventListener("click", () => void this.unlock().then(() => this.playCriticalAlarm()));

    panel.querySelectorAll<HTMLInputElement>("[data-audio-volume]").forEach((input) => {
      input.addEventListener("input", () => {
        const key = input.dataset.audioVolume as keyof Pick<AudioPrefs, "master" | "alarms" | "machinery" | "controls" | "ambient">;
        this.prefs[key] = Number(input.value);
        input.parentElement?.querySelector("output")?.replaceChildren(`${Math.round(Number(input.value) * 100)}%`);
        this.applyVolumes();
        this.savePrefs();
      });
    });
  }

  private volumeSlider(key: keyof Pick<AudioPrefs, "master" | "alarms" | "machinery" | "controls" | "ambient">, label: string): string {
    const value = this.prefs[key];
    return `<label class="audio-volume"><span>${label}</span><input data-audio-volume="${key}" type="range" min="0" max="1" step="0.01" value="${value}"><output>${Math.round(value * 100)}%</output></label>`;
  }

  private bindUnlock(): void {
    const firstGesture = (): void => {
      void this.unlock();
      window.removeEventListener("pointerdown", firstGesture, true);
      window.removeEventListener("keydown", firstGesture, true);
    };
    window.addEventListener("pointerdown", firstGesture, true);
    window.addEventListener("keydown", firstGesture, true);
  }

  private bindOperationSounds(): void {
    document.addEventListener("pointerdown", (event) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>("button, select, input[type=range]");
      if (!target || target.closest("#audio-control-panel")) return;
      const text = target.textContent ?? "";
      if (target.matches("input[type=range]")) this.playKnob();
      else if (target.matches("select")) this.playToggle();
      else if (target.id === "az5-button" || text.includes("AZ-5")) this.playAz5Guard();
      else if (target.id === "breaker-button" || text.includes("遮断器")) this.playBreakerImpact();
      else if (text.includes("トリップ")) this.playTripImpact();
      else if (target.matches("[data-pump], [data-fwp]")) this.playPumpSwitch();
      else this.playButton();
    }, true);

    document.addEventListener("input", (event) => {
      const input = event.target as HTMLInputElement | null;
      if (!input?.matches("input[type=range]")) return;
      const now = performance.now();
      const previous = Number(input.dataset.audioTick ?? "0");
      if (now - previous > 70) {
        input.dataset.audioTick = String(now);
        this.playKnob();
      }
    }, true);
  }

  private startPlantObserver(): void {
    window.setInterval(() => {
      if (!this.unlocked || !this.prefs.enabled) return;
      this.observeAlarms();
      this.observePumps();
      this.observeBreakerAndTrips();
      this.updateContinuousMachinery();
    }, 350);
  }

  private observeAlarms(): void {
    const active = [...document.querySelectorAll<HTMLElement>(".annunciator.active")];
    const currentIds = new Set(active.map((node) => node.dataset.alarmId ?? node.textContent?.trim() ?? "unknown"));
    const newAlarms = [...currentIds].filter((id) => !this.previousAlarmIds.has(id));
    if (newAlarms.length) {
      const critical = active.some((node) => node.classList.contains("critical") && newAlarms.includes(node.dataset.alarmId ?? node.textContent?.trim() ?? "unknown"));
      critical ? this.playCriticalAlarm() : this.playWarningAlarm();
    }
    const hasCritical = active.some((node) => node.classList.contains("critical"));
    if (hasCritical && performance.now() - this.lastCriticalReminder > 6500) this.playCriticalReminder();
    this.previousAlarmIds = currentIds;
  }

  private observePumps(): void {
    const pumps = document.querySelectorAll("[data-pump].running").length;
    const feed = document.querySelectorAll("[data-fwp].running").length;
    if (pumps !== this.previousPumpCount || feed !== this.previousFeedPumpCount) {
      pumps + feed > this.previousPumpCount + this.previousFeedPumpCount ? this.playMotorStart() : this.playMotorStop();
      this.previousPumpCount = pumps;
      this.previousFeedPumpCount = feed;
    }
  }

  private observeBreakerAndTrips(): void {
    const breaker = document.getElementById("breaker-button")?.classList.contains("closed") ?? false;
    if (breaker !== this.previousBreaker) {
      breaker ? this.playBreakerClose() : this.playBreakerOpen();
      this.previousBreaker = breaker;
    }
    const trip = document.getElementById("trip-button")?.classList.contains("active") ?? false;
    if (trip && !this.previousTrip) this.playSteamTrip();
    this.previousTrip = trip;

    const az5 = document.querySelector('.annunciator[data-alarm-id="scram"].active, #az5-button.active') !== null;
    if (az5 && !this.previousAz5) this.playAz5Sequence();
    this.previousAz5 = az5;
  }

  private ensureAmbient(): void {
    if (!this.context || !this.ambientBus || this.ambientVoice) return;
    const gain = this.context.createGain();
    gain.gain.value = 0.055;
    gain.connect(this.ambientBus);
    const oscillators = [50, 100, 150].map((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      const partial = this.context!.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      partial.gain.value = [0.46, 0.16, 0.06][index] ?? 0.05;
      oscillator.connect(partial).connect(gain);
      oscillator.start();
      return oscillator;
    });
    const noise = this.context.createBufferSource();
    noise.buffer = this.createNoise(2);
    noise.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 430;
    const noiseGain = this.context.createGain();
    noiseGain.gain.value = 0.03;
    noise.connect(filter).connect(noiseGain).connect(gain);
    noise.start();
    this.ambientVoice = { gain, oscillators };
  }

  private updateContinuousMachinery(): void {
    if (!this.context || !this.machineryBus) return;
    const totalPumps = this.previousPumpCount + this.previousFeedPumpCount;
    if (!this.pumpVoice) this.pumpVoice = this.createVoice([47, 188], ["sawtooth", "sine"], this.machineryBus);
    this.pumpVoice.gain.gain.setTargetAtTime(totalPumps ? Math.min(0.12, 0.025 + totalPumps * 0.012) : 0, this.context.currentTime, 0.45);

    if (!this.turbineVoice) this.turbineVoice = this.createVoice([120, 244], ["sine", "triangle"], this.machineryBus);
    const rpm = this.readRpm();
    if (rpm > 50) {
      const base = 80 + Math.min(220, rpm / 13);
      this.turbineVoice.oscillators[0]?.frequency.setTargetAtTime(base, this.context.currentTime, 0.2);
      this.turbineVoice.oscillators[1]?.frequency.setTargetAtTime(base * 2.04, this.context.currentTime, 0.2);
      this.turbineVoice.gain.gain.setTargetAtTime(Math.min(0.08, rpm / 50000), this.context.currentTime, 0.4);
    } else {
      this.turbineVoice.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.4);
    }
  }

  private createVoice(frequencies: number[], types: OscillatorType[], bus: GainNode): ContinuousVoice {
    const gain = this.context!.createGain();
    gain.gain.value = 0;
    gain.connect(bus);
    const oscillators = frequencies.map((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      oscillator.frequency.value = frequency;
      oscillator.type = types[index] ?? "sine";
      oscillator.connect(gain);
      oscillator.start();
      return oscillator;
    });
    return { gain, oscillators };
  }

  private readRpm(): number {
    const selectors = ["#turbine-rpm-value", "[data-value=turbine-rpm]", ".siut-desk .dial-value"];
    for (const selector of selectors) {
      const text = document.querySelector<HTMLElement>(selector)?.textContent;
      if (!text) continue;
      const value = Number(text.replace(/[^0-9.+-]/g, ""));
      if (Number.isFinite(value)) return value;
    }
    return 0;
  }

  private createNoise(seconds: number): AudioBuffer {
    const length = Math.floor(this.context!.sampleRate * seconds);
    const buffer = this.context!.createBuffer(1, length, this.context!.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < data.length; index += 1) {
      previous = previous * 0.985 + (Math.random() * 2 - 1) * 0.015;
      data[index] = previous;
    }
    return buffer;
  }

  private tone(frequency: number, duration: number, level: number, bus: GainNode | null, type: OscillatorType = "sine", delay = 0): void {
    if (!this.context || !bus || !this.unlocked || !this.prefs.enabled) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(bus);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  private burst(duration: number, level: number, bus: GainNode | null, frequency: number, delay = 0): void {
    if (!this.context || !bus || !this.unlocked || !this.prefs.enabled) return;
    const start = this.context.currentTime + delay;
    const source = this.context.createBufferSource();
    source.buffer = this.createNoise(Math.max(0.12, duration));
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(bus);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  private playButton(): void { this.burst(0.045, 0.16, this.controlBus, 1700); this.tone(160, 0.055, 0.08, this.controlBus, "square"); }
  private playKnob(): void { this.burst(0.022, 0.055, this.controlBus, 2400); }
  private playToggle(): void { this.tone(420, 0.04, 0.07, this.controlBus, "square"); this.tone(220, 0.05, 0.05, this.controlBus, "square", 0.035); }
  private playRelay(level = 1): void { this.burst(0.06, 0.13 * level, this.controlBus, 1250); this.tone(95, 0.08, 0.08 * level, this.controlBus, "square"); }
  private playPumpSwitch(): void { this.playRelay(); this.tone(72, 0.16, 0.07, this.controlBus, "sawtooth", 0.04); }
  private playBreakerImpact(): void { this.burst(0.085, 0.24, this.controlBus, 600); this.tone(58, 0.13, 0.18, this.controlBus, "square"); }
  private playTripImpact(): void { this.burst(0.12, 0.23, this.controlBus, 750); this.tone(85, 0.22, 0.17, this.controlBus, "square"); }
  private playAz5Guard(): void { this.burst(0.07, 0.18, this.controlBus, 1900); this.tone(260, 0.09, 0.1, this.controlBus, "square"); }
  private playMotorStart(): void { for (let index = 0; index < 8; index += 1) this.tone(48 + index * 11, 0.18, 0.025, this.machineryBus, "sawtooth", index * 0.055); }
  private playMotorStop(): void { for (let index = 0; index < 7; index += 1) this.tone(120 - index * 13, 0.16, 0.025, this.machineryBus, "sawtooth", index * 0.05); }
  private playBreakerClose(): void { this.playBreakerImpact(); this.tone(100, 0.12, 0.08, this.machineryBus, "sine", 0.08); }
  private playBreakerOpen(): void { this.burst(0.11, 0.24, this.controlBus, 520); this.tone(44, 0.18, 0.16, this.controlBus, "square"); }
  private playWarningAlarm(): void { this.tone(740, 0.18, 0.11, this.alarmBus, "square"); this.tone(740, 0.18, 0.11, this.alarmBus, "square", 0.28); }
  private playCriticalAlarm(): void { this.lastCriticalReminder = performance.now(); for (let index = 0; index < 6; index += 1) this.tone(index % 2 ? 610 : 920, 0.22, 0.13, this.alarmBus, "square", index * 0.24); }
  private playCriticalReminder(): void { this.lastCriticalReminder = performance.now(); this.tone(880, 0.16, 0.085, this.alarmBus, "square"); this.tone(660, 0.16, 0.085, this.alarmBus, "square", 0.2); }
  private playAz5Sequence(): void { this.playCriticalAlarm(); this.burst(0.7, 0.12, this.machineryBus, 380, 0.12); for (let index = 0; index < 12; index += 1) this.tone(95 - index * 3, 0.09, 0.035, this.machineryBus, "sawtooth", 0.2 + index * 0.07); }
  private playSteamTrip(): void { this.playBreakerOpen(); this.burst(1.35, 0.18, this.machineryBus, 1800, 0.08); this.tone(180, 0.8, 0.055, this.machineryBus, "sawtooth", 0.05); }

  private refreshPanel(): void {
    const status = document.getElementById("audio-status");
    if (status) status.textContent = !this.prefs.enabled ? "ミュート中" : this.unlocked ? "動作中" : "タップで開始";
    const mute = document.getElementById("audio-mute");
    if (mute) mute.textContent = this.prefs.enabled ? "ミュート" : "音を再開";
    document.body.classList.toggle("audio-muted", !this.prefs.enabled);
  }
}

queueMicrotask(() => new ControlRoomAudio().install());
