import test from "node:test";
import assert from "node:assert/strict";
import { createAudioController, normalizeAudioSettings } from "../src/audio.js";

function fakeContext() {
  const stats = {
    resumes: 0,
    bufferStarts: 0,
    oscillatorStarts: 0,
    oscillatorFrequencies: [],
    stops: 0,
  };
  const param = () => ({
    value: 0,
    setValueAtTime(value) { this.value = value; },
    exponentialRampToValueAtTime(value) { this.value = value; },
  });
  const node = () => ({
    connect() { return this; },
    start() { stats.bufferStarts += 1; },
    stop() { stats.stops += 1; },
  });
  const context = {
    state: "suspended", sampleRate: 8, currentTime: 0, destination: {}, stats,
    async resume() { stats.resumes += 1; this.state = "running"; },
    createBuffer(_channels, length) {
      const data = new Float32Array(length);
      return { getChannelData() { return data; } };
    },
    createBufferSource() { return { ...node(), loop: false, buffer: null }; },
    createBiquadFilter() { return { ...node(), type: "", frequency: param() }; },
    createGain() { return { ...node(), gain: param() }; },
    createOscillator() {
      const oscillator = { ...node(), type: "", frequency: param() };
      oscillator.start = () => {
        stats.oscillatorStarts += 1;
        stats.oscillatorFrequencies.push(oscillator.frequency.value);
      };
      return oscillator;
    },
  };
  return context;
}

test("audio settings normalize all procedural backgrounds and volumes", () => {
  for (const noise of ["rain", "static", "ocean", "fan", "gamma"]) {
    assert.equal(normalizeAudioSettings({ noise }).noise, noise);
  }
  assert.deepEqual(normalizeAudioSettings({
    noise: "gamma", noiseVolume: 0.4, alertVolume: 0.9,
    repeatUntilContinue: true,
  }), {
    noise: "gamma", noiseVolume: 0.4, alertVolume: 0.9,
    repeatUntilContinue: true,
  });
  assert.deepEqual(normalizeAudioSettings({ noise: "bad", noiseVolume: 9 }), {
    noise: "off", noiseVolume: 0.35, alertVolume: 0.7,
    repeatUntilContinue: false,
  });
  assert.deepEqual(normalizeAudioSettings(null), normalizeAudioSettings());
});

test("background sound runs if and only if at least one timer is active", async () => {
  const context = fakeContext();
  const audio = createAudioController({ createContext: () => context, random: () => 0.75 });
  audio.setSettings({ noise: "rain", noiseVolume: 0.5 });
  assert.equal(await audio.unlock(), true);
  assert.equal(context.stats.bufferStarts, 0);
  assert.equal(audio.getStatus().playing, false);

  audio.setActive(true);
  assert.equal(context.stats.bufferStarts, 1);
  assert.equal(audio.getStatus().playing, true);
  audio.setActive(false);
  assert.equal(context.stats.stops, 1);
  assert.equal(audio.getStatus().playing, false);

  audio.setActive(true);
  audio.setSettings({ noise: "fan" });
  assert.equal(context.stats.bufferStarts, 3);
  audio.setSettings({ noise: "gamma" });
  assert.equal(context.stats.oscillatorStarts, 1);
  assert.equal(context.stats.oscillatorFrequencies.at(-1), 40);
  assert.equal(audio.getStatus().noise, "gamma");
  audio.setActive(false);
  assert.equal(audio.getStatus().playing, false);
});

test("a pending unlock cannot restart sound after the last timer pauses", async () => {
  const context = fakeContext();
  let finishResume;
  context.resume = async () => {
    context.stats.resumes += 1;
    await new Promise((resolve) => { finishResume = resolve; });
    context.state = "running";
  };
  const audio = createAudioController({ createContext: () => context });
  audio.setSettings({ noise: "static" });
  audio.setActive(true);
  const unlocking = audio.unlock();
  audio.setActive(false);
  finishResume();
  assert.equal(await unlocking, true);
  assert.equal(context.stats.bufferStarts, 0);
  assert.equal(audio.getStatus().playing, false);
});

test("phase bell repeats until acknowledgement and then clears", async () => {
  const context = fakeContext();
  const scheduled = [];
  const cleared = [];
  const audio = createAudioController({
    createContext: () => context,
    schedule: (callback) => { scheduled.push(callback); return 42; },
    cancelSchedule: (id) => cleared.push(id),
  });
  await audio.unlock();
  assert.equal(audio.playPhaseBell({ repeat: true }), true);
  assert.equal(context.stats.oscillatorStarts, 2);
  scheduled[0]();
  assert.equal(context.stats.oscillatorStarts, 4);
  audio.stopAlert();
  assert.deepEqual(cleared, [42]);
  assert.equal(audio.getStatus().repeating, false);
});

test("unavailable audio degrades without throwing", async () => {
  const audio = createAudioController({ createContext: () => { throw new Error("blocked"); } });
  audio.setActive(true);
  assert.equal(await audio.unlock(), false);
  assert.equal(audio.playPhaseBell({ repeat: true }), false);
  assert.equal(audio.getStatus().available, false);
  assert.equal(audio.getStatus().playing, false);
});
