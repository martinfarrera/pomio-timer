import test from "node:test";
import assert from "node:assert/strict";
import { MINUTE_MS } from "../src/domain/timers.js";
import { createDefaultState } from "../src/storage.js";
import { reconcileAppState, reduceApp } from "../src/app.js";

const NOW = 1_800_000_000_000;
const normal = (id, minutes, sectionId = "inbox") => ({
  id, name: id, kind: "normal", sectionId,
  config: { durationMs: minutes * MINUTE_MS },
});

test("timer and section CRUD includes moving timers before section deletion", () => {
  let state = createDefaultState();
  state = reduceApp(state, { type: "section/create", id: "work", name: "Work" });
  state = reduceApp(state, { type: "timer/create", timer: normal("reading", 25, "work") });
  state = reduceApp(state, { type: "timer/create", timer: normal("writing", 50, "work") });
  assert.equal(state.timers[0].sectionId, "work");
  state = reduceApp(state, {
    type: "timer/update", id: "reading", changes: { name: "Read", sectionId: "inbox" },
  });
  state = reduceApp(state, { type: "section/update", id: "work", name: "Projects" });
  assert.equal(state.timers[0].name, "Read");
  assert.equal(state.sections[1].name, "Projects");
  state = reduceApp(state, { type: "section/delete", id: "work" });
  assert.deepEqual(state.sections.map(({ id }) => id), ["inbox"]);
  assert.equal(state.timers.find(({ id }) => id === "writing").sectionId, "inbox");
  state = reduceApp(state, { type: "timer/delete", id: "reading" });
  assert.deepEqual(state.timers.map(({ id }) => id), ["writing"]);
});

test("independent controls and Start all preserve running timers and share now", () => {
  let state = createDefaultState();
  state = reduceApp(state, { type: "timer/create", timer: normal("a", 10) });
  state = reduceApp(state, { type: "timer/create", timer: normal("b", 20) });
  state = reduceApp(state, { type: "timer/control", id: "a", command: "start" }, NOW);
  const firstDeadline = state.timers[0].runtime.deadlineEpochMs;
  assert.equal(state.timers[1].runtime.status, "idle");
  state = reduceApp(state, { type: "timer/start-all" }, NOW + 5_000);
  assert.equal(state.timers[0].runtime.deadlineEpochMs, firstDeadline);
  assert.equal(
    state.timers[1].runtime.deadlineEpochMs - 20 * MINUTE_MS,
    NOW + 5_000,
  );
  state = reduceApp(state, { type: "timer/control", id: "a", command: "pause" }, NOW + MINUTE_MS);
  assert.equal(state.timers[0].runtime.status, "paused");
  assert.equal(state.timers[1].runtime.status, "running");
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
});
