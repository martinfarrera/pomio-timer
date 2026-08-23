import test from "node:test";
import assert from "node:assert/strict";
import { createAudioController, normalizeAudioSettings } from "../src/audio.js";

function fakeContext() {
  const stats = { resumes: 0, bufferStarts: 0, oscillatorStarts: 0, stops: 0 };
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
      const oscillator = { ...node(), frequency: param() };
      oscillator.start = () => { stats.oscillatorStarts += 1; };
      return oscillator;
    },
  };
  return context;
}

test("audio settings normalize global noise and volume choices", () => {
  assert.deepEqual(normalizeAudioSettings({
    noise: "ocean", noiseVolume: 0.4, alertVolume: 0.9,
    repeatUntilContinue: true,
  }), {
    noise: "ocean", noiseVolume: 0.4, alertVolume: 0.9,
    repeatUntilContinue: true,
  });
  assert.deepEqual(normalizeAudioSettings({ noise: "bad", noiseVolume: 9 }), {
    noise: "off", noiseVolume: 0.35, alertVolume: 0.7,
    repeatUntilContinue: false,
  });
});

test("gesture unlock starts and switches all three procedural noises", async () => {
  const context = fakeContext();
  const audio = createAudioController({ createContext: () => context, random: () => 0.75 });
  audio.setSettings({ noise: "rain", noiseVolume: 0.5 });
  assert.equal(await audio.unlock(), true);
  assert.equal(context.stats.resumes, 1);
  for (const noise of ["static", "ocean"]) audio.setSettings({ noise });
  assert.equal(context.stats.bufferStarts, 3);
  assert.equal(context.stats.stops, 2);
  assert.equal(audio.getStatus().noise, "ocean");
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
  assert.equal(await audio.unlock(), false);
  assert.equal(audio.playPhaseBell({ repeat: true }), false);
  assert.equal(audio.getStatus().available, false);
});
