import test from "node:test";
import assert from "node:assert/strict";
import {
  MINUTE_MS, REST_MINUTES, createTimer, getCurrentPhaseDisplay,
  getPomodoroDurations, reconcileTimer, transitionTimer,
  validateTimerInput,
} from "../src/domain/timers.js";

const NOW = 1_800_000_000_000;
const runtime = (status, phase, cycleIndex, remainingMs, deadlineEpochMs) => ({
  status, phase, cycleIndex, remainingMs, deadlineEpochMs,
});
const pomodoro = (overrides = {}) => createTimer({
  id: "deep-work", name: "Deep work", emoji: "🧠", color: "coral",
  sectionId: "work", kind: "pomodoro",
  config: { hours: 3, restMinutes: 15, autoAdvance: true }, ...overrides,
});

test("normal and Pomodoro inputs are validated immutably", () => {
  const input = {
    id: "reading", name: "  Reading  ", kind: "normal",
    config: { durationMs: 25 * MINUTE_MS },
  };
  const snapshot = structuredClone(input);
  assert.deepEqual(validateTimerInput(input), {
    id: "reading", name: "Reading", emoji: "", color: "coral",
    dialColor: "coral", sectionId: "inbox", kind: "normal",
    config: { durationMs: 25 * MINUTE_MS },
  });
  assert.deepEqual(input, snapshot);
  assert.throws(() => validateTimerInput({ ...input, name: " " }), /nombre/i);
  assert.throws(
    () => validateTimerInput({ ...input, config: { durationMs: 0 } }), /duración/i,
  );
  const pomoInput = (hours, restMinutes) => ({
    ...input, kind: "pomodoro", config: { hours, restMinutes, autoAdvance: true },
  });
  assert.throws(() => validateTimerInput(pomoInput(1.5, 15)), /entero positivo/i);
  assert.throws(() => validateTimerInput(pomoInput(2, 12)), /descanso/i);
  assert.equal(validateTimerInput({ ...input, color: "blue" }).dialColor, "blue");
  assert.equal(
    validateTimerInput({ ...input, color: "blue", dialColor: "amber" }).dialColor,
    "amber",
  );
  assert.throws(
    () => validateTimerInput({ ...input, dialColor: "invisible" }),
    /color del dial/i,
  );
});

test("all rest choices produce one focus/rest cycle per hour", () => {
  assert.deepEqual(REST_MINUTES, [5, 10, 15, 20]);
  for (const restMinutes of REST_MINUTES) {
    assert.deepEqual(getPomodoroDurations(1, restMinutes), {
      cycles: 1,
      focusMs: (60 - restMinutes) * MINUTE_MS,
      restMs: restMinutes * MINUTE_MS,
    });
  }
  assert.deepEqual(getPomodoroDurations(3, 15), {
    cycles: 3, focusMs: 45 * MINUTE_MS, restMs: 15 * MINUTE_MS,
  });
});

test("start, pause, resume, and reset remain immutable", () => {
  const idle = pomodoro();
  const running = transitionTimer(idle, "start", NOW);
  const paused = transitionTimer(running, "pause", NOW + 5 * MINUTE_MS);
  const resumed = transitionTimer(paused, "start", NOW + 10 * MINUTE_MS);
  const reset = transitionTimer(resumed, "reset", NOW + 11 * MINUTE_MS);
  assert.equal(idle.runtime.status, "idle");
  assert.equal(running.runtime.deadlineEpochMs, NOW + 45 * MINUTE_MS);
  assert.deepEqual(paused.runtime, runtime("paused", "focus", 0, 40 * MINUTE_MS, null));
  assert.equal(resumed.runtime.deadlineEpochMs, NOW + 50 * MINUTE_MS);
  assert.deepEqual(reset.runtime, idle.runtime);
  assert.notEqual(running, idle);
});

test("automatic progression restores across multiple deadlines and completes", () => {
  const running = transitionTimer(pomodoro(), "start", NOW);
  const afterHour = reconcileTimer(running, NOW + 60 * MINUTE_MS);
  assert.deepEqual(
    afterHour.timer.runtime,
    runtime("running", "focus", 1, 45 * MINUTE_MS, NOW + 105 * MINUTE_MS),
  );
  assert.deepEqual(
    afterHour.transitions.map(({ phase, cycleIndex }) => ({ phase, cycleIndex })),
    [{ phase: "rest", cycleIndex: 0 }, { phase: "focus", cycleIndex: 1 }],
  );
  const restored = reconcileTimer(running, NOW + 130 * MINUTE_MS);
  assert.deepEqual(
    restored.timer.runtime,
    runtime("running", "focus", 2, 35 * MINUTE_MS, NOW + 165 * MINUTE_MS),
  );
  assert.equal(restored.transitions.length, 4);
  const completed = reconcileTimer(running, NOW + 180 * MINUTE_MS);
  assert.equal(completed.timer.runtime.status, "completed");
  assert.equal(completed.timer.runtime.remainingMs, 0);
  assert.equal(completed.transitions.at(-1).status, "completed");
});

test("manual progression waits at the first boundary until Continue", () => {
  const timer = pomodoro({ config: { hours: 2, restMinutes: 15, autoAdvance: false } });
  const waiting = reconcileTimer(transitionTimer(timer, "start", NOW), NOW + 90 * MINUTE_MS);
  assert.deepEqual(
    waiting.timer.runtime,
    runtime("awaitingContinue", "rest", 0, 15 * MINUTE_MS, null),
  );
  assert.equal(waiting.transitions.length, 1);
  const continued = transitionTimer(waiting.timer, "continue", NOW + 90 * MINUTE_MS);
  assert.equal(continued.runtime.status, "running");
  assert.equal(continued.runtime.deadlineEpochMs, NOW + 105 * MINUTE_MS);
});

test("display returns side-by-side ready zero-padded minutes and seconds", () => {
  const timer = transitionTimer(pomodoro(), "start", NOW);
  assert.deepEqual(getCurrentPhaseDisplay(timer, NOW), {
    minutes: "45", seconds: "00", remainingMs: 45 * MINUTE_MS, progress: 1,
  });
  assert.deepEqual(getCurrentPhaseDisplay(timer, NOW + 44 * MINUTE_MS + 59_001), {
    minutes: "00", seconds: "01", remainingMs: 999, progress: 0.00037,
  });
});
