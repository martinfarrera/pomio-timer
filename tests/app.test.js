import test from "node:test";
import assert from "node:assert/strict";
import { MINUTE_MS } from "../src/domain/timers.js";
import { createDefaultState, loadState, saveState } from "../src/storage.js";
import {
  hasRunningTimers, reconcileAppState, reduceApp, syncAudioActivity,
} from "../src/app.js";

const NOW = 1_800_000_000_000;
const normal = (id, minutes, sectionId = "inbox") => ({
  id,
  name: id,
  kind: "normal",
  sectionId,
  color: "blue",
  dialColor: "amber",
  config: { durationMs: minutes * MINUTE_MS },
});

test("timer CRUD keeps legacy sections dormant and new timers in inbox", () => {
  let state = createDefaultState();
  state.sections.push({ id: "work", name: "Work" });
  state = reduceApp(state, { type: "timer/create", timer: normal("reading", 25, "work") });
  state = reduceApp(state, { type: "timer/create", timer: normal("writing", 50) });
  assert.equal(state.timers[0].sectionId, "work");
  assert.equal(state.timers[1].sectionId, "inbox");

  state = reduceApp(state, {
    type: "timer/update",
    id: "reading",
    changes: { name: "Read", color: "rose", dialColor: "teal" },
  });
  assert.equal(state.timers[0].name, "Read");
  assert.equal(state.timers[0].sectionId, "work");
  assert.equal(state.timers[0].color, "rose");
  assert.equal(state.timers[0].dialColor, "teal");

  state = reduceApp(state, { type: "timer/delete", id: "reading" });
  assert.deepEqual(state.timers.map(({ id }) => id), ["writing"]);
  assert.deepEqual(state.sections, [
    { id: "inbox", name: "Temporizadores" },
    { id: "work", name: "Work" },
  ]);
});

test("running activity derives from timer runtimes after every control", () => {
  let state = createDefaultState();
  state = reduceApp(state, { type: "timer/create", timer: normal("a", 10) });
  state = reduceApp(state, { type: "timer/create", timer: normal("b", 20) });
  assert.equal(hasRunningTimers(state), false);

  state = reduceApp(state, { type: "timer/control", id: "a", command: "start" }, NOW);
  assert.equal(hasRunningTimers(state), true);
  state = reduceApp(state, { type: "timer/control", id: "a", command: "pause" }, NOW + MINUTE_MS);
  assert.equal(hasRunningTimers(state), false);

  state = reduceApp(state, { type: "timer/control", id: "a", command: "start" }, NOW);
  state = reduceApp(state, { type: "timer/control", id: "a", command: "reset" }, NOW);
  assert.equal(hasRunningTimers(state), false);

  state = reduceApp(state, { type: "timer/control", id: "a", command: "start" }, NOW);
  state = reduceApp(state, { type: "timer/control", id: "b", command: "start" }, NOW);
  state = reduceApp(state, { type: "timer/delete", id: "a" });
  assert.equal(hasRunningTimers(state), true);
  state = reduceApp(state, { type: "timer/delete", id: "b" });
  assert.equal(hasRunningTimers(state), false);
});

test("completion recovery removes the last running audio condition", () => {
  let state = createDefaultState();
  state = reduceApp(state, { type: "timer/create", timer: normal("short", 1) });
  state = reduceApp(state, { type: "timer/control", id: "short", command: "start" }, NOW);
  assert.equal(hasRunningTimers(state), true);
  const completed = reconcileAppState(state, NOW + MINUTE_MS);
  assert.equal(completed.state.timers[0].runtime.status, "completed");
  assert.equal(hasRunningTimers(completed.state), false);
});

test("reload preserves the running audio condition from a stored deadline", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  let state = createDefaultState();
  state = reduceApp(state, { type: "timer/create", timer: normal("reload", 5) });
  state = reduceApp(state, { type: "timer/control", id: "reload", command: "start" }, NOW);
  assert.equal(saveState(state, storage), true);
  const restored = loadState(storage);
  assert.equal(restored.timers[0].runtime.deadlineEpochMs, NOW + 5 * MINUTE_MS);
  assert.equal(hasRunningTimers(restored), true);
});

test("audio synchronization sends the derived runtime condition to the controller", () => {
  const activity = [];
  const audio = { setActive: (active) => activity.push(active) };
  let state = createDefaultState();
  syncAudioActivity(audio, state);
  state = reduceApp(state, { type: "timer/create", timer: normal("active", 5) });
  state = reduceApp(state, { type: "timer/control", id: "active", command: "start" }, NOW);
  syncAudioActivity(audio, state);
  assert.deepEqual(activity, [false, true]);
});

test("restoration and Continue flow cross Pomodoro boundaries deterministically", () => {
  let state = createDefaultState();
  state = reduceApp(state, {
    type: "timer/create",
    timer: {
      id: "focus", name: "Focus", kind: "pomodoro",
      config: { hours: 2, restMinutes: 15, autoAdvance: false },
    },
  });
  state = reduceApp(state, { type: "timer/control", id: "focus", command: "start" }, NOW);
  const restored = reconcileAppState(state, NOW + 90 * MINUTE_MS);
  assert.equal(restored.state.timers[0].runtime.status, "awaitingContinue");
  assert.equal(restored.state.timers[0].runtime.phase, "rest");
  assert.equal(restored.transitions.length, 1);
  state = reduceApp(
    restored.state,
    { type: "timer/control", id: "focus", command: "continue" },
    NOW + 90 * MINUTE_MS,
  );
  assert.equal(state.timers[0].runtime.deadlineEpochMs, NOW + 105 * MINUTE_MS);
});

test("repeat-until-Continue globally pauses an otherwise automatic transition", () => {
  let state = createDefaultState();
  state.audio.repeatUntilContinue = true;
  state = reduceApp(state, {
    type: "timer/create",
    timer: {
      id: "alert", name: "Alert", kind: "pomodoro",
      config: { hours: 1, restMinutes: 15, autoAdvance: true },
    },
  });
  state = reduceApp(state, { type: "timer/control", id: "alert", command: "start" }, NOW);
  const restored = reconcileAppState(state, NOW + 45 * MINUTE_MS);
  assert.equal(restored.state.timers[0].runtime.status, "awaitingContinue");
  assert.equal(restored.state.timers[0].runtime.phase, "rest");
  assert.equal(hasRunningTimers(restored.state), false);
});
