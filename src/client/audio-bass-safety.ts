const AUDIO_PREFS_KEY = "rbmk-audio-preferences";
const AUDIO_BASS_SAFETY_VERSION = 1;
const AUDIO_BASS_SAFETY_KEY = "rbmk-audio-bass-safety-version";

type ConnectFunction = (
  this: AudioNode,
  destination: AudioNode | AudioParam,
  output?: number,
  input?: number,
) => AudioNode | void;

function migrateUnsafeAudioLevels(): void {
  if (localStorage.getItem(AUDIO_BASS_SAFETY_KEY) === String(AUDIO_BASS_SAFETY_VERSION)) return;

  try {
    const parsed = JSON.parse(localStorage.getItem(AUDIO_PREFS_KEY) ?? "null") as Record<string, unknown> | null;
    const preferences = parsed && typeof parsed === "object" ? parsed : {};

    const machinery = typeof preferences.machinery === "number" ? preferences.machinery : 0.58;
    const ambient = typeof preferences.ambient === "number" ? preferences.ambient : 0.42;
    const master = typeof preferences.master === "number" ? preferences.master : 0.72;

    preferences.master = Math.min(master, 0.58);
    preferences.machinery = Math.min(machinery, 0.28);
    preferences.ambient = Math.min(ambient, 0.18);

    localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify(preferences));
    localStorage.setItem(AUDIO_BASS_SAFETY_KEY, String(AUDIO_BASS_SAFETY_VERSION));
  } catch {
    localStorage.setItem(AUDIO_BASS_SAFETY_KEY, String(AUDIO_BASS_SAFETY_VERSION));
  }
}

function installSubBassFilter(): void {
  const oscillatorPrototype = globalThis.OscillatorNode?.prototype;
  const sourcePrototype = globalThis.AudioBufferSourceNode?.prototype;
  const originalConnect = globalThis.AudioNode?.prototype.connect as ConnectFunction | undefined;
  if (!oscillatorPrototype || !sourcePrototype || !originalConnect) return;

  const patchSource = (prototype: AudioNode, cutoff: number): void => {
    const marker = `rbmkBassSafety${cutoff}`;
    const record = prototype as unknown as Record<string, unknown>;
    if (record[marker]) return;

    const ownConnect = prototype.connect as ConnectFunction;
    Object.defineProperty(prototype, "connect", {
      configurable: true,
      writable: true,
      value(this: AudioNode, destination: AudioNode | AudioParam, output = 0, input = 0): AudioNode | void {
        if (destination instanceof AudioParam) {
          return ownConnect.call(this, destination, output);
        }

        const highPass = this.context.createBiquadFilter();
        highPass.type = "highpass";
        highPass.frequency.value = cutoff;
        highPass.Q.value = 0.72;

        originalConnect.call(this, highPass, output, 0);
        originalConnect.call(highPass, destination, 0, input);
        return destination;
      },
    });
    record[marker] = true;
  };

  patchSource(oscillatorPrototype, 96);
  patchSource(sourcePrototype, 82);
}

migrateUnsafeAudioLevels();
installSubBassFilter();
