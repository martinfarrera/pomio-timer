const DEFAULTS = Object.freeze({
  noise: "off", noiseVolume: 0.35, alertVolume: 0.7,
  repeatUntilContinue: false,
});
const NOISES = new Set(["off", "rain", "static", "ocean"]);

export function normalizeAudioSettings(value = {}) {
  const volume = (candidate, fallback) =>
    Number.isFinite(candidate) && candidate >= 0 && candidate <= 1
      ? candidate
      : fallback;
  return {
    noise: NOISES.has(value.noise) ? value.noise : DEFAULTS.noise,
    noiseVolume: volume(value.noiseVolume, DEFAULTS.noiseVolume),
    alertVolume: volume(value.alertVolume, DEFAULTS.alertVolume),
    repeatUntilContinue: typeof value.repeatUntilContinue === "boolean"
      ? value.repeatUntilContinue
      : DEFAULTS.repeatUntilContinue,
  };
}

function browserContext() {
  const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Context) throw new Error("Web Audio is unavailable");
  return new Context();
}

function noiseSource(context, kind, volume, random) {
  const length = Math.max(1, Math.floor(context.sampleRate * 2));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let previous = 0;
  for (let index = 0; index < length; index += 1) {
    const raw = random() * 2 - 1;
    if (kind === "rain") {
      previous = (previous + raw * 0.22) / 1.08;
      samples[index] = previous;
    } else if (kind === "ocean") {
      const wave = 0.2 + 0.8 * ((Math.sin(index / context.sampleRate * Math.PI) + 1) / 2);
      samples[index] = raw * wave;
    } else samples[index] = raw;
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  source.loop = true;
  filter.type = kind === "static" ? "highpass" : "lowpass";
  filter.frequency.value = kind === "static" ? 1_000 : kind === "rain" ? 1_600 : 420;
  gain.gain.value = volume;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start();
  return { source, gain };
}

export function createAudioController(options = {}) {
  const createContext = options.createContext ?? browserContext;
  const schedule = options.schedule ?? ((callback) => setInterval(callback, 1_200));
  const cancelSchedule = options.cancelSchedule ?? clearInterval;
  const random = options.random ?? Math.random;
  let settings = { ...DEFAULTS };
  let context = null;
  let noise = null;
  let alertSchedule = null;
  let available = true;

  const stopNoise = () => {
    try { noise?.source.stop(); } catch { /* Already stopped. */ }
    noise = null;
  };
  const startNoise = () => {
    stopNoise();
    if (!context || context.state !== "running" || settings.noise === "off") return;
    try { noise = noiseSource(context, settings.noise, settings.noiseVolume, random); }
    catch { available = false; }
  };
  const ringOnce = () => {
    for (const [frequency, offset] of [[740, 0], [988, 0.22]]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = context.currentTime + offset;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(Math.max(0.001, settings.alertVolume), at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.55);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.58);
    }
  };

  const controller = {
    async unlock() {
      try {
        context ??= createContext();
        if (context.state === "suspended") await context.resume();
        available = context.state === "running";
        if (available && !noise) startNoise();
        return available;
      } catch {
        available = false;
        return false;
      }
    },
    setSettings(next) {
      const previousNoise = settings.noise;
      settings = normalizeAudioSettings({ ...settings, ...next });
      if (noise && previousNoise === settings.noise) noise.gain.gain.value = settings.noiseVolume;
      else if (context) startNoise();
    },
    playPhaseBell({ repeat = settings.repeatUntilContinue } = {}) {
      controller.stopAlert();
      if (!available || !context || context.state !== "running") {
        if (context?.state === "suspended") void context.resume().catch(() => {});
        return false;
      }
      if (settings.alertVolume === 0) return true;
      try {
        ringOnce();
        if (repeat) alertSchedule = schedule(ringOnce);
        return true;
      } catch {
        available = false;
        return false;
      }
    },
    stopAlert() {
      if (alertSchedule !== null) cancelSchedule(alertSchedule);
      alertSchedule = null;
    },
    getStatus() {
      return {
        available, unlocked: Boolean(context && context.state === "running"),
        noise: settings.noise, repeating: alertSchedule !== null,
      };
    },
    destroy() {
      controller.stopAlert();
      stopNoise();
      void context?.close?.();
    },
  };
  return controller;
}
