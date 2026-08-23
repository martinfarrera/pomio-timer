import { createTimer, validateTimerInput } from "./domain/timers.js";

export const STORAGE_VERSION = 1;
export const STORAGE_KEY = "pomio-timer-state";

const DEFAULT_SECTION = Object.freeze({ id: "inbox", name: "Timers" });
const DEFAULT_AUDIO = Object.freeze({
  noise: "off",
  noiseVolume: 0.35,
  alertVolume: 0.7,
  repeatUntilContinue: false,
});
const NOISES = new Set(["off", "rain", "static", "ocean"]);
const STATUSES = new Set([
  "idle", "running", "paused", "awaitingContinue", "completed",
]);

export function createDefaultState() {
  return {
    version: STORAGE_VERSION,
    sections: [{ ...DEFAULT_SECTION }],
    timers: [],
    audio: { ...DEFAULT_AUDIO },
  };
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSections(value) {
  if (!Array.isArray(value)) return [{ ...DEFAULT_SECTION }];
  const seen = new Set();
  const sections = [];
  for (const item of value) {
    const id = cleanText(item?.id);
    const name = cleanText(item?.name);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    sections.push({ id, name });
  }
  if (!seen.has(DEFAULT_SECTION.id)) sections.unshift({ ...DEFAULT_SECTION });
  return sections;
}

function normalizeAudio(value) {
  const volume = (candidate, fallback) =>
    Number.isFinite(candidate) && candidate >= 0 && candidate <= 1
      ? candidate
      : fallback;
  return {
    noise: NOISES.has(value?.noise) ? value.noise : DEFAULT_AUDIO.noise,
    noiseVolume: volume(value?.noiseVolume, DEFAULT_AUDIO.noiseVolume),
    alertVolume: volume(value?.alertVolume, DEFAULT_AUDIO.alertVolume),
    repeatUntilContinue:
      typeof value?.repeatUntilContinue === "boolean"
        ? value.repeatUntilContinue
        : DEFAULT_AUDIO.repeatUntilContinue,
  };
}

function normalizeRuntime(value, timer) {
  const fallback = createTimer(timer).runtime;
  if (!value || typeof value !== "object" || !STATUSES.has(value.status)) {
    return fallback;
  }
  const pomodoro = timer.kind === "pomodoro";
  const validPhase = pomodoro
    ? value.phase === "focus" || value.phase === "rest"
    : value.phase === null;
  const validCycle = Number.isInteger(value.cycleIndex) &&
    value.cycleIndex >= 0 &&
    value.cycleIndex < (pomodoro ? timer.config.hours : 1);
  const validRemaining = Number.isFinite(value.remainingMs) && value.remainingMs >= 0;
  const validDeadline = value.status !== "running" ||
    (Number.isFinite(value.deadlineEpochMs) && value.deadlineEpochMs > 0);
  if (!validPhase || !validCycle || !validRemaining || !validDeadline) return fallback;

  return {
    status: value.status,
    phase: value.phase,
    cycleIndex: value.cycleIndex,
    remainingMs: value.status === "completed" ? 0 : value.remainingMs,
    deadlineEpochMs: value.status === "running" ? value.deadlineEpochMs : null,
  };
}

function normalizeTimers(value, sectionIds) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const timers = [];
  for (const candidate of value) {
    const id = cleanText(candidate?.id);
    if (!id || seen.has(id)) continue;
    try {
      const timer = validateTimerInput({
        ...candidate,
        id,
        sectionId: sectionIds.has(candidate.sectionId) ? candidate.sectionId : "inbox",
      });
      timers.push({ ...timer, runtime: normalizeRuntime(candidate.runtime, timer) });
      seen.add(id);
    } catch {
      // One damaged timer must not prevent the rest of the library from loading.
    }
  }
  return timers;
}

export function normalizeState(value) {
  if (!value || typeof value !== "object" || value.version !== STORAGE_VERSION) {
    return createDefaultState();
  }
  const sections = normalizeSections(value.sections);
  const sectionIds = new Set(sections.map(({ id }) => id));
  return {
    version: STORAGE_VERSION,
    sections,
    timers: normalizeTimers(value.timers, sectionIds),
    audio: normalizeAudio(value.audio),
  };
}

export function loadState(storage = globalThis.localStorage) {
  try {
    const serialized = storage?.getItem(STORAGE_KEY);
    return serialized ? normalizeState(JSON.parse(serialized)) : createDefaultState();
  } catch {
    return createDefaultState();
  }
}

export function saveState(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
    return true;
  } catch {
    return false;
  }
}
