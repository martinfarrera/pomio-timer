import test from "node:test";
import assert from "node:assert/strict";
import { MINUTE_MS, createTimer } from "../src/domain/timers.js";
import {
  STORAGE_KEY, createDefaultState, loadState, normalizeState, saveState,
} from "../src/storage.js";

const NOW = 1_800_000_000_000;

class MemoryStorage {
  data = new Map();
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
}

function runningPomodoro() {
  const timer = createTimer({
    id: "focus", name: "Focus", emoji: "🍅", color: "rose",
    sectionId: "work", kind: "pomodoro",
    config: { hours: 3, restMinutes: 15, autoAdvance: true },
  });
  return {
    ...timer,
    runtime: {
      status: "running", phase: "rest", cycleIndex: 1,
      remainingMs: 12 * MINUTE_MS, deadlineEpochMs: NOW + 12 * MINUTE_MS,
    },
  };
}

test("defaults are versioned, complete, and returned without shared references", () => {
  const first = createDefaultState();
  const second = createDefaultState();
  assert.deepEqual(first, {
    version: 1,
    sections: [{ id: "inbox", name: "Timers" }],
    timers: [],
    audio: {
      noise: "off", noiseVolume: 0.35, alertVolume: 0.7,
      repeatUntilContinue: false,
    },
  });
  first.sections[0].name = "Changed";
  assert.equal(second.sections[0].name, "Timers");
});

test("save/load round-trip preserves sections, settings, phases, and deadlines", () => {
  const storage = new MemoryStorage();
  const state = {
    version: 1,
    sections: [{ id: "inbox", name: "Timers" }, { id: "work", name: "Work" }],
    timers: [runningPomodoro()],
    audio: {
      noise: "ocean", noiseVolume: 0.5, alertVolume: 0.8,
      repeatUntilContinue: true,
    },
  };
  assert.equal(saveState(state, storage), true);
  assert.deepEqual(loadState(storage), state);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).version, 1);
});

test("normalization removes invalid entries and repairs missing section links", () => {
  const valid = runningPomodoro();
  const normalized = normalizeState({
    version: 1,
    sections: [
      { id: "work", name: " Work " }, { id: "work", name: "Duplicate" },
      { id: "", name: "Invalid" },
    ],
    timers: [
      { ...valid, sectionId: "missing" },
      { ...valid, id: "focus", name: "Duplicate" },
      { id: "broken", name: "Broken", kind: "normal", config: { durationMs: 0 } },
    ],
    audio: { noise: "invalid", noiseVolume: 4, alertVolume: 0.4 },
  });
  assert.deepEqual(normalized.sections, [
    { id: "inbox", name: "Timers" }, { id: "work", name: "Work" },
  ]);
  assert.equal(normalized.timers.length, 1);
  assert.equal(normalized.timers[0].sectionId, "inbox");
  assert.equal(normalized.timers[0].runtime.phase, "rest");
  assert.equal(normalized.timers[0].runtime.deadlineEpochMs, NOW + 12 * MINUTE_MS);
  assert.deepEqual(normalized.audio, {
    noise: "off", noiseVolume: 0.35, alertVolume: 0.4,
    repeatUntilContinue: false,
  });
});

test("corrupt, unsupported, unavailable, and missing storage recover to defaults", () => {
  for (const value of ["not-json", JSON.stringify({ version: 0 }), null]) {
    const storage = new MemoryStorage();
    if (value !== null) storage.setItem(STORAGE_KEY, value);
    assert.deepEqual(loadState(storage), createDefaultState());
  }
  const unavailable = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("quota"); },
  };
  assert.deepEqual(loadState(unavailable), createDefaultState());
  assert.equal(saveState(createDefaultState(), unavailable), false);
});
