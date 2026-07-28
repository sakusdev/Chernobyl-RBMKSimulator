type AudioPreferences = {
  enabled: boolean;
  master: number;
  alarms: number;
  machinery: number;
  controls: number;
  ambient: number;
};

type LoopVoice = {
  gain: GainNode;
  oscillators: OscillatorNode[];
  stop: () => void;
};

const STORAGE_KEY = "rbmk-audio-preferences";
const defaults: AudioPreferences = {
  enabled: true,
  master: 0.72,
  alarms: 0.82,
  machinery: 0.58,
  controls: 0.68,
  ambient: 0.42,
};

class ControlRoomAudio {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private alarmBus: GainNode | null = null;
  private machineryBus: GainNode | null = null;
  private controlsBus: GainNode | null = null;
  private ambientBus: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private preferences = this.loadPreferences();
  private unlocked = false;
  private alarmSignature = "";
  private lastAlarmToneAt = 0;
  private ambientVoice: LoopVoice | null = null;
  private turbineVoice: LoopVoice | null = null;
  private pumpVoice: LoopVoice | null = null;
  private lastPumpCount = 0;
  private lastFeedPumpCount = 0;
  private lastBreakerClosed = false;
  private lastTripState = false;
  private lastAz5State = false;

  public install(): void {
    this.installPanel();
    this.bindUnlock();
    this.bindControls();
    this.observePlant();
    this.applyPreferenceUI();
  }

  private loadPreferences(): AudioPreferences {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<AudioPreferences> | null;
      return {
        enabled: saved?.enabled ?? defaults.enabled,
        master: this.clamp(saved?.master ?? defaults.master),
        alarms: this.clamp(saved?.alarms ?? defaults.alarms),
        machinery: this.clamp(saved?.machinery ?? defaults.machinery),
        controls: this.clamp(saved?.controls ?? defaults.controls),
        ambient: this.clamp(saved?.ambient ?? defaults.ambient),
      };
    } catch {
      return { ...defaults };
    }
  }

  private savePreferences(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.preferences));
  }

  private clamp(value: number): number {
    return Math.min(1, Math.max(0, value));
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    try {
      this.context = new AudioContext({ latencyHint: "interactive" });
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -18;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 8;
      this.compressor.attack.value = 0.004;
      this.compressor.release.value = 0.22;

      this.masterGain = this.context.createGain();
      this.alarmBus = this.context.createGain();
      this.machineryBus = this.context.createGain();
      this.controlsBus = this.context.createGain();
      this.ambientBus = this.context.createGain();

      for (const bus of [this.alarmBus, this.machineryBus, this.controlsBus, this.ambientBus]) {
        bus.connect(this.masterGain);
      }
      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.context.destination);
      this.applyVolumes();
      return this.context;
    } catch {
      return null;
    }
  }

  private async unlock(): Promise<void> {
    const context = this.ensureContext();
    if (!context) return;
    if (context.state !== "running") await context.resume();
    this.unlocked = context.state === "running";
    document.body.classList.toggle("audio-unlocked", this.unlocked);
    this.updateStatus();
    if (this.unlocked && this.preferences.enabled) {
      this.playRelayClick(0.6);
      this.startAmbient();
    }
  }

  private applyVolumes(): void {
    if (!this.masterGain || !this.alarmBus || !this.machineryBus || !this.controlsBus || !this.ambientBus) return;
    const active = this.preferences.enabled ? 1 : 0;
    const now = this.context?.currentTime ?? 0;
    this.masterGain.gain.setTargetAtTime(this.preferences.master * active, now, 0.025);
    this.alarmBus.gain.setTargetAtTime(this.preferences.alarms, now, 0.025);
    this.machineryBus.gain.setTargetAtTime(this.preferences.machinery, now, 0.025);
    this.controlsBus.gain.setTargetAtTime(this.preferences.controls, now, 0.025);
    this.ambientBus.gain.setTargetAtTime(this.preferences.ambient, now, 0.025);
  }

  private installPanel(): void {
    if (document.getElementById("audio-control-panel")) return;
    const panel = document.createElement("aside");
    panel.id = "audio-control-panel";
    panel.className = "audio-control-panel collapsed";
    panel.innerHTML = `
      <button id="audio-panel-toggle" class="audio-panel-toggle" aria-expanded="false">音響</button>
      <div class="audio-panel-body">
        <header><strong>制御室音響</strong><span id="audio-status">未有効</span></header>
        <button id="audio-enable" class="audio-enable">音響を有効化</button>
        ${this.slider("master", "全体", this.preferences.master)}
        ${this.slider("alarms", "警報", this.preferences.alarms)}
        ${this.slider("machinery", "機械", this.preferences.machinery)}
        ${this.slider("controls", "操作音", this.preferences.controls)}
        ${this.slider("ambient", "環境音", this.preferences.ambient)}
        <div class="audio-panel-actions">
          <button id="audio-mute">ミュート</button>
          <button id="audio-test">警報試験</button>
        </div>
        <small>ブラウザの制限により、最初に画面をタップすると音響が開始されます。</small>
      </div>`;
    document.body.append(panel);

    panel.querySelector("#audio-panel-toggle")?.addEventListener("click", () => {
      const collapsed = panel.classList.toggle("collapsed");
      panel.querySelector("#audio-panel-toggle")?.setAttribute("aria-expanded", String(!collapsed));
    });
    panel.querySelector("#audio-enable")?.addEventListener("click", () => void this.unlock());
    panel.querySelector("#audio-mute")?.addEventListener("click", () => {
      this.preferences.enabled = !this.preferences.enabled;
      this.applyVolumes();
      this.savePreferences();
      this.applyPreferenceUI();
      if (this.preferences.enabled) void this.unlock();
    });
    panel.querySelector("#audio-test")?.addEventListener("click", () => {
      void this.unlock().then(() => this.playCriticalAlarm());
    });

    panel.querySelectorAll<HTMLInputElement>("input[data-audio-volume]").forEach((input) => {
      input.addEventListener("input", () => {
        const key = input.dataset.audioVolume as keyof Pick<AudioPreferences, "master" | "alarms" | "machinery" | "controls" | "ambient">;
        this.preferences[key] = Number(input.value);
        const output = input.parentElement?.querySelector("output");
        if (output) output.textContent = `${Math.round(Number(input.value) * 100)}%`;
        this.applyVolumes();
        this.savePreferences();
      });
    });
  }

  private slider(key: string, label: string, value: number): string {
    return `<label class="audio-volume"><span>${label}</span><input data-audio-volume="${key}" type="range" min="0" max="1" step="0.01" value="${value}"><output>${Math.round(value * 100)}%</output></label>`;
  }

  private bindUnlock(): void {
    const unlockOnce = (): void => {
      void this.unlock();
      window.removeEventListener("pointerdown", unlockOnce, true);
      window.removeEventListener("keydown", unlockOnce, true);
    };
    window.addEventListener("pointerdown", unlockOnce, true);
    window.addEventListener("keydown", unlockOnce, true);
  }

  private bindControls(): void {
    document.addEventListener("pointerdown", (event) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>("button, input[type=range], select");
      if (!target || target.closest("#audio-control-panel")) return;
      if (target.matches("input[type=range]")) this.playKnobTick();
      else if (target.matches("select")) this.playToggle();
      else if (target.id === "az5-button" || target.textContent?.includes("AZ-5")) this.playAz5Guard();
      else if (target.id === "breaker-button" || target.textContent?.includes("遮断器")) this.playBreaker();
      else if (target.textContent?.includes("トリップ")) this.playTripButton();
      else if (target.matches("[data-pump], [data-fwp]")) this.playPumpSwitch();
      else this.playButtonClick();
    }, true);

    document.addEventListener("input", (event) => {
      const target = event.target as HTMLInputElement | null;
      if (!target?.matches("input[type=range]")) return;
      const now = performance.now();
      const previous = Number(target.dataset.lastAudioTick ?? "0");
      if (now - previous > 65) {
        target.dataset.lastAudioTick = String(now);
        this.playKnobTick();
      }
    }, true);
  }

  private observePlant(): void {
    window.setInterval(() => {
      if (!this.unlocked || !this.preferences.enabled) return;
      const active = [...document.querySelectorAll<HTMLElement>(".annunciator.active")];
      const critical = active.filter((node) => node.classList.contains("critical"));
      const signature = active.map((node) => node.dataset.alarmId ?? node.textContent?.trim() ?? "").sort().join("|");
      if (signature !== this.alarmSignature) {
        const newlyActive = signature && !this.alarmSignature.includes(signature);
        this.alarmSignature = signature;
        if (newlyActive) {
          if (critical.length) this.playCriticalAlarm();
          else this.playWarningAlarm();
        }
      }
      if (critical.length && performance.now() - this.lastAlarmToneAt > 6000) this.playCriticalReminder();

      const pumps = document.querySelectorAll("[data-pump].running").length;
      const feedPumps = document.querySelectorAll("[data-fwp].running").length;
      if (pumps !== this.lastPumpCount || feedPumps !== this.lastFeedPumpCount) {
        if (pumps + feedPumps > this.lastPumpCount + this.lastFeedPumpCount) this.playMotorStart();
        else this.playMotorStop();
        this.lastPumpCount = pumps;
        this.lastFeedPumpCount = feedPumps;
      }
      this.updateMachineryLoops(pumps + feedPumps);

      const breaker = document.getElementById("breaker-button")?.classList.contains("closed") ?? false;
      if (breaker !== this.lastBreakerClosed) {
        breaker ? this.playBreakerClose() : this.playBreakerOpen();
        this.lastBreakerClosed = breaker;
      }
      const trip = document.getElementById("trip-button")?.classList.contains("active") ?? false;
      if (trip && !this.lastTripState) this.playSteamTrip();
      this.lastTripState = trip;

      const az5 = document.querySelector(".annunciator[data-alarm-id=sc...ram].active, #az5-button.active") !== null;
      if (az5 && !this.lastAz5State) this.playAz5Sequence();
      this.lastAz5State = az5;
    }, 350);
  }

  private startAmbient(): void {
    if (this.ambientVoice || !this.context || !this.ambientBus) return;
    const context = this.context;
    const gain = context.createGain();
    gain.gain.value = 0.06;
    gain.connect(this.ambientBus);
    const oscillators: OscillatorNode[] = [];
    for (const [frequency, level] of [[50, 0.45], [100, 0.18], [150, 0.08]] as const) {
      const osc = context.createOscillator();
      const partialGain = context.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      partialGain.gain.value = level;
      osc.connect(partialGain).connect(gain);
      osc.start();
      oscillators.push(osc);
    }
    const noise = context.createBufferSource();
    noise.buffer = this.createNoiseBuffer(2);
    noise.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    const noiseGain = context.createGain();
    noiseGain.gain.value = 0.035;
    noise.connect(filter).connect(noiseGain).connect(gain);
    noise.start();
    this.ambientVoice = {
      gain,
      oscillators,
      stop: () => {
        oscillators.forEach((osc) => osc.stop());
        noise.stop();
        gain.disconnect();
      },
    };
  }

  private updateMachineryLoops(pumpCount: number): void {
    if (!this.context || !this.machineryBus) return;
    const context = this.context;
    if (!this.pumpVoice) {
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(this.machineryBus);
      const low = context.createOscillator();
      const high = context.createOscillator();
      low.type = "sawtooth";
      high.type = "sine";
      low.frequency.value = 47;
      high.frequency.value = 188;
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 680;
      low.connect(filter).connect(gain);
      high.connect(gain);
      low.start();
      high.start();
      this.pumpVoice = { gain, oscillators: [low, high], stop: () => { low.stop(); high.stop(); gain.disconnect(); } };
    }
    const target = pumpCount > 0 ? Math.min(0.12, 0.025 + pumpCount * 0.012) : 0;
    this.pumpVoice.gain.gain.setTargetAtTime(target, context.currentTime, 0.45);

    const rpm = this.readNumericText(["#turbine-rpm-value", "[data-value=turbine-rpm]", ".siut-desk .dial-value"]);
    if (!this.turbineVoice) {
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(this.machineryBus);
      const osc1 = context.createOscillator();
      const osc2 = context.createOscillator();
      osc1.type = "sine";
      osc2.type = "triangle";
      osc1.connect(gain);
      osc2.connect(gain);
      osc1.start();
      osc2.start();
      this.turbineVoice = { gain, oscillators: [osc1, osc2], stop: () => { osc1.stop(); osc2.stop(); gain.disconnect(); } };
    }
    if (Number.isFinite(rpm) && rpm > 50) {
      const base = 80 + Math.min(220, rpm / 13);
      this.turbineVoice.oscillators[0]?.frequency.setTargetAtTime(base, context.currentTime, 0.18);
      this.turbineVoice.oscillators[1]?.frequency.setTargetAtTime(base * 2.04, context.currentTime, 0.18);
      this.turbineVoice.gain.gain.setTargetAtTime(Math.min(0.08, rpm / 50000), context.currentTime, 0.35);
    } else {
      this.turbineVoice.gain.gain.setTargetAtTime(0, context.currentTime, 0.35);
    }
  }

  private readNumericText(selectors: string[]): number {
    for (const selector of selectors) {
      const text = document.querySelector<HTMLElement>(selector)?.textContent;
      if (!text) continue;
      const value = Number(text.replace(/[^0-9.+-]/g, ""));
      if (Number.isFinite(value)) return value;
    }
    return Number.NaN;
  }

  private createNoiseBuffer(seconds: number): AudioBuffer {
    const context = this.context!;
    const length = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.985 + white * 0.015;
      channel[i] = previous;
    }
    return buffer;
  }

  private tone(frequency: number, duration: number, gainValue: number, bus: GainNode | null, type: OscillatorType = "sine", delay = 0): void {
    if (!this.context || !bus || !this.unlocked || !this.preferences.enabled) return;
    const now = this.context.currentTime + delay;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(bus);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  private noiseBurst(duration: number, gainValue: number, bus: GainNode | null, frequency = 1100, delay = 0): void {
    if (!this.context || !bus || !this.unlocked || !this.preferences.enabled) return;
    const now = this.context.currentTime + delay;
    const source = this.context.createBufferSource();
    source.buffer = this.createNoiseBuffer(Math.max(0.1, duration));
    const filter = this.context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.8;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(bus);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  private playButtonClick(): void { this.noiseBurst(0.045, 0.16, this.controlsBus, 1700); this.tone(160, 0.055, 0.08, this.controlsBus, "square"); }
  private playKnobTick(): void { this.noiseBurst(0.022, 0.055, this.controlsBus, 2400); }
  private playToggle(): void { this.tone(420, 0.04, 0.07, this.controlsBus, "square"); this.tone(220, 0.05, 0.05, this.controlsBus, "square", 0.035); }
  private playRelayClick(level = 1): void { this.noiseBurst(0.06, 0.13 * level, this.controlsBus, 1250); this.tone(95, 0.08, 0.08 * level, this.controlsBus, "square"); }
  private playPumpSwitch(): void { this.playRelayClick(); this.tone(72, 0.16, 0.07, this.controlsBus, "sawtooth", 0.04); }
  private playMotorStart(): void { for (let i = 0; i < 8; i += 1) this.tone(48 + i * 11, 0.18, 0.025, this.machineryBus, "sawtooth", i * 0.055); }
  private playMotorStop(): void { for (let i = 0; i < 7; i += 1) this.tone(120 - i * 13, 0.16, 0.025, this.machineryBus, "sawtooth", i * 0.05); }
  private playBreaker(): void { this.noiseBurst(0.085, 0.24, this.controlsBus, 600); this.tone(58, 0.13, 0.18, this.controlsBus, "square"); }
  private playBreakerClose(): void { this.playBreaker(); this.tone(100, 0.12, 0.08, this.machineryBus, "sine", 0.08); }
  private playBreakerOpen(): void { this.noiseBurst(0.11, 0.24, this.controlsBus, 520); this.tone(44, 0.18, 0.16, this.controlsBus, "square"); }
  private playTripButton(): void { this.noiseBurst(0.12, 0.23, this.controlsBus, 750); this.tone(85, 0.22, 0.17, this.controlsBus, "square"); }
  private playAz5Guard(): void { this.noiseBurst(0.07, 0.18, this.controlsBus, 1900); this.tone(260, 0.09, 0.1, this.controlsBus, "square"); }

  private playWarningAlarm(): void {
    this.lastAlarmToneAt = performance.now();
    this.tone(740, 0.18, 0.11, this.alarmBus, "square");
    this.tone(740, 0.18, 0.11, this.alarmBus, "square", 0.28);
  }

  private playCriticalAlarm(): void {
    this.lastAlarmToneAt = performance.now();
    for (let i = 0; i < 6; i += 1) {
      this.tone(i % 2 === 0 ? 920 : 610, 0.22, 0.13, this.alarmBus, "square", i * 0.24);
    }
  }

  private playCriticalReminder(): void {
    this.lastAlarmToneAt = performance.now();
    this.tone(880, 0.16, 0.085, this.alarmBus, "square");
    this.tone(660, 0.16, 0.085, this.alarmBus, "square", 0.2);
  }

  private playAz5Sequence(): void {
    this.playCriticalAlarm();
    this.noiseBurst(0.7, 0.12, this.machineryBus, 380, 0.12);
    for (let i = 0; i < 12; i += 1) this.tone(95 - i * 3, 0.09, 0.035, this.machineryBus, "sawtooth", 0.2 + i * 0.07);
  }

  private playSteamTrip(): void {
    this.playBreakerOpen();
    this.noiseBurst(1.35, 0.18, this.machineryBus, 1800, 0.08);
    this.tone(180, 0.8, 0.055, this.machineryBus, "sawtooth", 0.05);
  }

  private applyPreferenceUI(): void {
    const mute = document.getElementById("audio-mute");
    if (mute) mute.textContent = this.preferences.enabled ? "ミュート" : "音を再開";
    document.body.classList.toggle("audio-muted", !this.preferences.enabled);
    this.updateStatus();
  }

  private updateStatus(): void {
    const status = document.getElementById("audio-status");
    if (!status) return;
    if (!this.preferences.enabled) status.textContent = "ミュート中";
    else if (!this.unlocked) status.textContent = "タップで開始";
    else status.textContent = "動作中";
  }
}

const audio = new ControlRoomAudio();
queueMicrotask(() => audio.install());
